/** One document: preview, print / save as PDF, share, status, edit, duplicate, delete. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import PrintDoc from '../components/PrintDoc.jsx';
import { Header, Sheet, back, go, useUi } from '../components/ui.jsx';
import { del, get, put } from '../lib/db.js';
import { STATUS_LABELS, money, shortDate, typeOf } from '../lib/docs.js';
import { upiLink } from '../lib/qr.js';
import { useApp } from '../App.jsx';

/** Scales the 794-px wide A4 page to the phone's width. */
function Fit({ children }) {
  const box = useRef(null);
  const [scale, setScale] = useState(0.45);
  const [height, setHeight] = useState(500);
  useLayoutEffect(() => {
    const measure = () => {
      const w = box.current?.clientWidth || 360;
      const s = Math.min(1, w / 794);
      setScale(s);
      const page = box.current?.querySelector('.print-doc');
      setHeight((page?.offsetHeight || 1100) * s);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [children]);
  return (
    <div ref={box} className="doc-frame" style={{ height }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 794 }}>{children}</div>
    </div>
  );
}

export default function View({ id }) {
  const { company } = useApp();
  const { toast, confirm } = useUi();
  const [doc, setDoc] = useState(null);
  const [statusSheet, setStatusSheet] = useState(false);
  useEffect(() => {
    get('documents', id).then((d) => (d ? setDoc(d) : go('/documents', { replace: true })));
  }, [id]);
  if (!doc) return <Header title="" onBack={() => back('/documents')} />;
  const type = typeOf(doc.type);

  const setStatus = async (status) => {
    const next = { ...doc, status, updatedAt: new Date().toISOString() };
    await put('documents', next);
    setDoc(next);
    setStatusSheet(false);
    toast(`Marked as ${STATUS_LABELS[status]}`);
  };
  const print = () => {
    const title = document.title;
    document.title = `${doc.number} - ${doc.party.name}`;
    window.print();
    setTimeout(() => (document.title = title), 1000);
  };
  const share = async () => {
    const pay = type.qr && company.upi ? upiLink({ upiId: company.upi, payee: company.name, amount: doc.totals?.grand_total, note: doc.number }) : '';
    const text = [
      `${type.label} ${doc.number} from ${company.name}`,
      `Date: ${shortDate(doc.date)}`,
      type.prices !== false ? `Amount: ${money(doc.totals?.grand_total)}` : '',
      pay ? `Pay by UPI: ${pay}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      if (navigator.share) await navigator.share({ title: `${type.label} ${doc.number}`, text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Details copied');
      }
    } catch {
      /* share cancelled */
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${doc.number}?`, message: 'This document is removed from this phone. This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    await del('documents', doc.id);
    toast(`${doc.number} deleted`);
    go('/documents', { replace: true });
  };

  return (
    <>
      <Header
        title={doc.number}
        onBack={() => back('/documents')}
        actions={
          <button className="icon-btn" onClick={() => go(`/doc/${doc.id}/edit`)} aria-label="Edit" data-testid="edit-doc">
            <Icon name="edit" />
          </button>
        }
      />
      <div className="page" data-testid="view">
        <div className="card row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>{doc.party.name}</strong>
            <div className="small muted">
              {type.label} · {shortDate(doc.date)}
            </div>
          </div>
          <button className={`pill ${doc.status}`} style={{ cursor: 'pointer', fontSize: 13, padding: '6px 12px' }} onClick={() => setStatusSheet(true)} data-testid="status">
            {STATUS_LABELS[doc.status]} ▾
          </button>
        </div>
        <div className="grid-2">
          <button className="btn btn-primary" onClick={print} data-testid="print">
            <Icon name="printer" size={19} /> Print / PDF
          </button>
          <button className="btn" onClick={share} data-testid="share">
            <Icon name="share" size={19} /> Share
          </button>
        </div>
        <Fit>
          <PrintDoc doc={doc} company={company} />
        </Fit>
        <div className="grid-2">
          <button className="btn" onClick={() => go(`/doc/${doc.id}/copy`)} data-testid="duplicate">
            <Icon name="copy" size={19} /> Duplicate
          </button>
          <button className="btn btn-danger" onClick={remove} data-testid="delete">
            <Icon name="trash" size={19} /> Delete
          </button>
        </div>
      </div>
      {statusSheet && (
        <Sheet title="Status" onClose={() => setStatusSheet(false)}>
          <div className="list">
            {type.statuses.map((s) => (
              <button key={s} className="list-item" style={{ minHeight: 54 }} onClick={() => setStatus(s)} data-testid={`status-${s}`}>
                <span className="list-main">{STATUS_LABELS[s]}</span>
                {doc.status === s && <Icon name="check" />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
