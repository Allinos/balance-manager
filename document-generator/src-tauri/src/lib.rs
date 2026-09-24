//! DocGen desktop backend: SQLite storage, numbering, backup and the optional
//! remote advertisement configuration.

mod commands;
mod db;
mod numbering;
mod remote;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            db::set_log_path(data_dir.join("docgen.log"));
            let database = db::Db::open(data_dir.join("docgen.sqlite")).map_err(|e| {
                db::log_error("startup", &e.message);
                Box::<dyn std::error::Error>::from(e.message)
            })?;
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::print_window,
            commands::open_external,
            commands::settings_get_all,
            commands::settings_set,
            commands::company_get,
            commands::company_save,
            commands::doc_settings_get_all,
            commands::doc_settings_save,
            commands::sequences_list,
            commands::sequence_save,
            commands::sequence_preview,
            commands::categories_list,
            commands::category_save,
            commands::category_delete,
            commands::products_list,
            commands::product_save,
            commands::product_delete,
            commands::parties_list,
            commands::party_save,
            commands::party_delete,
            commands::documents_list,
            commands::document_get,
            commands::document_save,
            commands::document_set_status,
            commands::document_delete,
            commands::document_restore,
            commands::dashboard_stats,
            commands::demo_remove,
            commands::pick_image,
            commands::backup_export,
            commands::backup_restore,
            commands::ad_state_get,
            commands::ad_state_set,
            commands::remote_config_fetch,
            commands::ad_event_record,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DocGen");
}
