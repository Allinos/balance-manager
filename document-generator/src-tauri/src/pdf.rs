//! "Download PDF": saves the current document view as an A4 PDF file without
//! a print dialog, using the platform web engine itself so the PDF looks
//! exactly like the preview (and no PDF library is bundled).
//!
//!  * Windows: WebView2 `PrintToPdf`
//!  * Linux:   WebKitGTK print operation to a PDF file
//!  * macOS:   not available yet → the app falls back to the print dialog
//!             ("Save as PDF").

use crate::db::{log_error, AppError, AppResult};
use std::path::PathBuf;
use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

const MARGIN_MM: f64 = 12.0;

fn safe_file_name(name: &str) -> String {
    let base: String = name
        .chars()
        .map(|c| if c.is_control() || r#"\/:*?"<>|"#.contains(c) { '-' } else { c })
        .collect::<String>()
        .trim()
        .chars()
        .take(120)
        .collect();
    let base = if base.is_empty() { "document".to_string() } else { base };
    if base.to_ascii_lowercase().ends_with(".pdf") { base } else { format!("{base}.pdf") }
}

/// Ask where to save and write the PDF. Returns the saved path, or None if cancelled.
/// Errors starting with "UNSUPPORTED|" tell the UI to fall back to the print dialog.
#[tauri::command]
pub async fn document_save_pdf(app: AppHandle, window: WebviewWindow, file_name: String) -> AppResult<Option<String>> {
    if !cfg!(any(windows, target_os = "linux")) {
        return Err(AppError::new("UNSUPPORTED|Direct PDF download is not available on this system."));
    }
    let file_name = safe_file_name(&file_name);
    let path: PathBuf = match crate::files::e2e_save(&file_name) {
        Some(p) => p,
        None => {
            let picked = app
                .dialog()
                .file()
                .set_title("Save PDF")
                .set_file_name(&file_name)
                .add_filter("PDF document", &["pdf"])
                .blocking_save_file();
            let Some(p) = picked else { return Ok(None) };
            p.into_path().map_err(|_| AppError::new("This location cannot be used."))?
        }
    };
    let path = if path.extension().is_none() { path.with_extension("pdf") } else { path };
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    start_print(&window, path.clone(), tx)?;
    let outcome = tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(std::time::Duration::from_secs(90)))
        .await
        .map_err(|_| AppError::new("PDF creation was interrupted."))?;
    match outcome {
        Ok(Ok(())) => {
            // WebKit reports completion slightly before the file is flushed.
            for _ in 0..50 {
                if std::fs::metadata(&path).map(|m| m.len() > 0).unwrap_or(false) {
                    return Ok(Some(path.to_string_lossy().to_string()));
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(AppError::new("The PDF file could not be written."))
        }
        Ok(Err(e)) => {
            log_error("pdf", &e);
            Err(AppError::new("The PDF could not be created. Please use Print → Save as PDF instead."))
        }
        Err(_) => Err(AppError::new("Creating the PDF took too long. Please try again.")),
    }
}

#[cfg(target_os = "linux")]
fn start_print(window: &WebviewWindow, path: PathBuf, tx: std::sync::mpsc::Sender<Result<(), String>>) -> AppResult<()> {
    use webkit2gtk::PrintOperationExt;
    window
        .with_webview(move |wv| {
            let webview = wv.inner();
            let op = webkit2gtk::PrintOperation::new(&webview);
            let settings = gtk::PrintSettings::new();
            settings.set_printer("Print to File");
            settings.set(gtk::PRINT_SETTINGS_OUTPUT_FILE_FORMAT, Some("pdf"));
            let uri = format!("file://{}", path.to_string_lossy());
            settings.set(gtk::PRINT_SETTINGS_OUTPUT_URI, Some(&uri));
            let setup = gtk::PageSetup::new();
            setup.set_paper_size(&gtk::PaperSize::new(Some(&gtk::PAPER_NAME_A4)));
            setup.set_top_margin(MARGIN_MM, gtk::Unit::Mm);
            setup.set_bottom_margin(MARGIN_MM, gtk::Unit::Mm);
            setup.set_left_margin(MARGIN_MM, gtk::Unit::Mm);
            setup.set_right_margin(MARGIN_MM, gtk::Unit::Mm);
            op.set_print_settings(&settings);
            op.set_page_setup(&setup);
            let done = tx.clone();
            op.connect_finished(move |_| {
                let _ = done.send(Ok(()));
            });
            let failed = tx.clone();
            op.connect_failed(move |_, err| {
                let _ = failed.send(Err(err.to_string()));
            });
            op.print();
        })
        .map_err(|e| {
            log_error("pdf", &e.to_string());
            AppError::new("The PDF could not be created.")
        })
}

#[cfg(windows)]
fn start_print(window: &WebviewWindow, path: PathBuf, tx: std::sync::mpsc::Sender<Result<(), String>>) -> AppResult<()> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment6, ICoreWebView2_7};
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};
    window
        .with_webview(move |wv| {
            let report = tx.clone();
            let result = (|| -> windows::core::Result<()> {
                unsafe {
                    let core = wv.controller().CoreWebView2()?;
                    let core7: ICoreWebView2_7 = core.cast()?;
                    let env6: ICoreWebView2Environment6 = wv.environment().cast()?;
                    let settings = env6.CreatePrintSettings()?;
                    let margin = MARGIN_MM / 25.4;
                    settings.SetPageWidth(210.0 / 25.4)?;
                    settings.SetPageHeight(297.0 / 25.4)?;
                    settings.SetMarginTop(margin)?;
                    settings.SetMarginBottom(margin)?;
                    settings.SetMarginLeft(margin)?;
                    settings.SetMarginRight(margin)?;
                    settings.SetShouldPrintBackgrounds(true)?;
                    settings.SetShouldPrintHeaderAndFooter(false)?;
                    let done = report.clone();
                    let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, success| {
                        let ok: bool = success;
                        let _ = done.send(if result.is_ok() && ok { Ok(()) } else { Err("PrintToPdf failed".into()) });
                        Ok(())
                    }));
                    let target = HSTRING::from(path.as_os_str());
                    core7.PrintToPdf(&target, &settings, &handler)?;
                }
                Ok(())
            })();
            if let Err(e) = result {
                let _ = report.send(Err(e.to_string()));
            }
        })
        .map_err(|e| {
            log_error("pdf", &e.to_string());
            AppError::new("The PDF could not be created.")
        })
}

#[cfg(not(any(windows, target_os = "linux")))]
fn start_print(_window: &WebviewWindow, _path: PathBuf, _tx: std::sync::mpsc::Sender<Result<(), String>>) -> AppResult<()> {
    Err(AppError::new("UNSUPPORTED|Direct PDF download is not available on this system."))
}
