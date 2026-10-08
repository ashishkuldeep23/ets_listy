"use client";

// View / Can tick / Can edit checkboxes used when sharing a folder.
// View is always on. Ticking "Can edit" also ticks "Can tick"; unticking
// "Can tick" also unticks "Can edit" (edit includes tick).

export interface Permissions {
  canCheck: boolean;
  canEdit: boolean;
}

interface PermissionCheckboxesProps {
  value: Permissions;
  onChange: (next: Permissions) => void;
  disabled?: boolean;
}

export default function PermissionCheckboxes({ value, onChange, disabled }: PermissionCheckboxesProps) {
  const box = "size-4 accent-primary";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <label className="flex items-center gap-1.5 text-muted" title="Everyone you share with can see the folder">
        <input type="checkbox" checked disabled className={box} />
        View
      </label>
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={value.canCheck}
          disabled={disabled}
          onChange={(e) => onChange({ canCheck: e.target.checked, canEdit: e.target.checked && value.canEdit })}
          className={box}
        />
        Can tick items
      </label>
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={value.canEdit}
          disabled={disabled}
          onChange={(e) => onChange({ canCheck: e.target.checked || value.canCheck, canEdit: e.target.checked })}
          className={box}
        />
        Can edit items
      </label>
    </div>
  );
}
