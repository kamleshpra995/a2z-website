// Paste into DevTools on the original A2Z browser origin (plain JavaScript on purpose).
// The downloaded file stays on this computer; import it with scripts/import-browser.ts.
(async () => {
  const raw = localStorage.getItem('a2z-service-desk:v1');
  if (!raw) throw Error('No legacy A2Z records found on this origin.');
  const { sessions, publicGrants, ...state } = JSON.parse(raw);
  state.users = state.users.map(({ passwordHash, passwordSalt, ...user }) => user);
  const ids = state.tickets.flatMap((ticket) => (ticket.attachments || []).map((file) => file.id));
  const files = [];
  if (ids.length) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('a2z-ticket-files');
      request.onupgradeneeded = () => request.transaction.abort();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(Error('Legacy attachment database is unavailable.'));
    });
    try {
      for (const id of ids) {
        const file = await new Promise((resolve, reject) => {
          const request = db.transaction('files', 'readonly').objectStore('files').get(id);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (!file) throw Error(`Missing legacy attachment ${id}. No export was written.`);
        files.push({ id, base64: file.base64 });
      }
    } finally {
      db.close();
    }
  }
  const blob = new Blob([JSON.stringify({ format: 'a2z-browser-v1', state, files })], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'a2z-browser-export.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
})().catch((error) => console.error(error.message));
