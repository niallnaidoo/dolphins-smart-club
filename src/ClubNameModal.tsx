import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Btn } from './atoms';

/* ─── ClubNameModal — rename a club ───
   Used on BOTH the admin club-detail page and the club portal. The save handler is
   the same `patchClub({ name })`; the backend decides the rest: an admin rename
   applies directly, while a rep's rename applies live but is flagged for review
   (server sets nameChangePending + previousName). Two clubs may not share a name —
   a duplicate is rejected by the API (400) and surfaces via the parent's withToast. */
export function ClubNameModal({
  club,
  onClose,
  onSave,
  toast,
  successToast = null as ((name: string) => string) | null,
}) {
  const [name, setName] = useState(club.name || '');
  const [busy, setBusy] = useState(false);
  const cleanName = name.trim();
  const canSave = !!cleanName && cleanName.length <= 80 && cleanName !== club.name && !busy;

  function save() {
    if (!canSave) return;
    setBusy(true);
    // Resolve(onSave) so a rejected save (409 conflict or duplicate-name 400) keeps
    // the modal open for retry rather than closing on a failure.
    Promise.resolve(onSave && onSave(cleanName))
      .then(() => {
        // Caller can override (the club side notes the change is flagged for the league office).
        toast && toast(successToast ? successToast(cleanName) : `Club renamed · ${cleanName}`);
        onClose && onClose();
      })
      .catch(() => setBusy(false));
  }

  return createPortal(
    <div className="task-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="task-modal narrow" style={{ maxWidth: 520 }}>
        <div className="task-modal-head">
          <div className="task-modal-head-text">
            <div className="task-modal-head-eyebrow">Club details</div>
            <div className="task-modal-head-title">
              Rename <em>club</em> · {club.name}
            </div>
          </div>
          <button className="task-modal-close" onClick={onClose} title="Close">
            <Icon.X />
          </button>
        </div>
        <div className="task-modal-body">
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            Renames this club across the portal. Its web address, fixtures, players and documents
            are unaffected. Two clubs can't share a name.
          </p>
          <div className="field">
            <div className="field-label">
              Club name <span className="req">*</span>
            </div>
            <input
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="Club name"
              maxLength={80}
              autoFocus
            />
          </div>
          <div
            className="row"
            style={{
              justifyContent: 'flex-end',
              gap: 8,
              paddingTop: 16,
              marginTop: 18,
              borderTop: '1px solid var(--line)',
            }}
          >
            <Btn tone="outline" onClick={onClose}>
              Cancel
            </Btn>
            <Btn tone="teal" icon={Icon.Check} disabled={!canSave} onClick={save}>
              {busy ? 'Saving…' : 'Save name'}
            </Btn>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
