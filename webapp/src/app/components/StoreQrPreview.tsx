import { useEffect, useState } from 'react';
import { Download, QrCode, Share2 } from 'lucide-react';
import { storeQrText } from '@shared/stores.ts';
import type { Client } from '@shared/types.ts';
import type { FormState } from '../types.ts';

/** The QR on a store sticker opens the public complaint form at /portal/?store=<id>. */
export const storeTicketUrl = (storeId: string): string =>
  `${(import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, '')}/portal/?store=${encodeURIComponent(storeId)}`;

interface StoreQrPreviewProps {
  store: FormState;
  client: Client | undefined;
}

export default function StoreQrPreview({ store, client }: StoreQrPreviewProps) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [sharing, setSharing] = useState(false);
  const storeName = store.name ?? '';
  const filename = `${storeName.replace(/[^a-z0-9_-]/gi, '-') || 'store'}-qr.png`;

  let payload = '';
  let validation = '';
  try {
    if (store.id && !store.hasStoreCode && !store.storeCode)
      throw Error('Generate a Store Code from Store master before viewing its ticket QR.');
    payload =
      store.id && (store.hasStoreCode || store.storeCode)
        ? storeTicketUrl(store.id)
        : storeQrText(store, client);
  } catch (caught) {
    validation = (caught as Error).message;
  }

  async function shareQr() {
    setSharing(true);
    setShareMessage('');
    try {
      const bytes = Uint8Array.from(atob(image.split(',')[1] ?? ''), (character) =>
        character.charCodeAt(0),
      );
      const file = new File([bytes], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: storeName, files: [file] });
      } else if (typeof navigator.share === 'function') {
        await navigator.share({ title: storeName, text: payload });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        setShareMessage('Store details copied. Download the QR to share its image.');
      } else {
        setShareMessage('Sharing is unavailable here. Download the QR image to share it.');
      }
    } catch (caught) {
      if ((caught as Error).name !== 'AbortError')
        setShareMessage('Could not share. Download the QR image to share it.');
    } finally {
      setSharing(false);
    }
  }

  useEffect(() => {
    let active = true;
    setImage('');
    setShareMessage('');
    setError('');
    if (payload) {
      import('qrcode')
        .then((module) =>
          module.default.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 4, width: 480 }),
        )
        .then((url) => {
          if (active) setImage(url);
        })
        .catch(() => {
          if (active) setError('Could not generate QR. Shorten the store details and try again.');
        });
    }
    return () => {
      active = false;
    };
  }, [payload]);
  return (
    <section className="store-qr-preview" aria-label="Store QR preview">
      <h3>
        <QrCode size={19} />
        Store details QR
      </h3>
      {validation || error ? (
        <div className="error" role="alert">
          {validation || error}
        </div>
      ) : (
        <>
          {image ? (
            <img
              src={image}
              alt={`Scannable store details QR for ${storeName}`}
              width="300"
              height="300"
            />
          ) : (
            <p>Generating QR…</p>
          )}
          <p>
            {store.id && (store.hasStoreCode || store.storeCode)
              ? 'Scan to raise a ticket. Store Code verification is required.'
              : 'Draft preview only. Save the store to generate its ticket QR.'}
          </p>
          {image && (
            <div className="store-qr-actions">
              <button
                type="button"
                className="outline qr-action"
                aria-label="Share QR"
                title="Share QR"
                onClick={shareQr}
                disabled={sharing}
              >
                <Share2 size={18} />
              </button>
              <a
                className="outline qr-action"
                href={image}
                download={filename}
                aria-label="Download QR"
                title="Download QR"
              >
                <Download size={18} />
              </a>
            </div>
          )}
          {shareMessage && <p role="status">{shareMessage}</p>}
          <details>
            <summary>QR content</summary>
            <pre>{payload}</pre>
          </details>
        </>
      )}
    </section>
  );
}
