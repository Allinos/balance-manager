import { DownloadList } from '../../components/Downloads.jsx';
import ShareReferral from '../../components/ShareReferral.jsx';
import { useAuth } from '../../App.jsx';

/** Client panel → Downloads (what is offered is set in Admin → Downloads). */
export default function DownloadsPage() {
  const { client } = useAuth();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Downloads</h1>
          <p className="muted">Install DocGen on your computer or phone, then enter your license key (My License).</p>
        </div>
        <ShareReferral link={client.user?.referralLink} code={client.user?.referralCode} />
      </div>
      <DownloadList />
    </>
  );
}
