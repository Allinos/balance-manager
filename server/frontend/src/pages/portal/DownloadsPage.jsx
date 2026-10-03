import { DownloadList } from '../../components/Downloads.jsx';

/** Client panel → Downloads (what is offered is set in Admin → Downloads). */
export default function DownloadsPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Downloads</h1>
          <p className="muted">Install DocGen on your computer or phone, then enter your license key (My License).</p>
        </div>
      </div>
      <DownloadList />
    </>
  );
}
