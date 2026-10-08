"use client";

// Home page body: create a folder, and see / rename / delete my folders.

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

export default function FolderList() {
  const [folders, setFolders] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/folders")
      .then((data) => setFolders(data.folders))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function createFolder(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    try {
      const folder = await apiFetch("/api/folders", { method: "POST", body: JSON.stringify({ name }) });
      setFolders((prev) => [folder, ...prev]);
      setName("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function renameFolder(id, newName) {
    setError("");
    try {
      const folder = await apiFetch(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify({ name: newName }) });
      setFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function deleteFolder(folder) {
    if (!confirm(`Delete "${folder.name}"? This cannot be undone.`)) return;
    setError("");
    try {
      await apiFetch(`/api/folders/${folder.id}`, { method: "DELETE" });
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <form onSubmit={createFolder} className="mb-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New folder name (e.g. Market, Oct)"
          maxLength={60}
          className="input flex-1"
        />
        <button className="btn-primary">Add folder</button>
      </form>

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      {loading && <p className="text-muted">Loading…</p>}
      {!loading && folders.length === 0 && (
        <p className="card text-muted">No folders yet. Create your first one above.</p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {folders.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            onRename={(newName) => renameFolder(folder.id, newName)}
            onDelete={() => deleteFolder(folder)}
          />
        ))}
      </ul>
    </div>
  );
}

function FolderCard({ folder, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);

  async function save(e) {
    e.preventDefault();
    if (draft.trim() === folder.name) return setEditing(false);
    if (await onRename(draft)) setEditing(false);
  }

  return (
    <li className="card flex flex-col gap-3">
      {editing ? (
        <form onSubmit={save} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={60}
            autoFocus
            className="input flex-1 py-1"
          />
          <button className="btn-secondary">Save</button>
          <button
            type="button"
            onClick={() => {
              setDraft(folder.name);
              setEditing(false);
            }}
            className="btn-ghost"
          >
            Cancel
          </button>
        </form>
      ) : (
        <Link href={`/folders/${folder.id}`} className="text-lg font-semibold hover:text-primary">
          {folder.name}
        </Link>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Updated {new Date(folder.updatedAt).toLocaleDateString("en-IN")}</span>
        {!editing && (
          <div className="flex gap-3">
            <button onClick={() => setEditing(true)} className="link">
              Rename
            </button>
            <button onClick={onDelete} className="text-danger hover:underline">
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
