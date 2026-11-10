import React, { useState } from 'react';
import { CriteriaRow } from '../types/dgnb';
import { Check, Edit2, Plus, Trash2, X, AlertCircle } from 'lucide-react';

interface ReviewCriteriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  detectedStandardName: string;
  detectedInstitute: string;
  detectedVersion: string;
  criteriaRows: CriteriaRow[];
  onConfirmImport: (standardData: {
    name: string;
    institute: string;
    version: string;
    rows: CriteriaRow[];
  }) => void;
}

export const ReviewCriteriaModal: React.FC<ReviewCriteriaModalProps> = ({
  isOpen,
  onClose,
  detectedStandardName,
  detectedInstitute,
  detectedVersion,
  criteriaRows,
  onConfirmImport,
}) => {
  const [standardName, setStandardName] = useState(detectedStandardName);
  const [institute, setInstitute] = useState(detectedInstitute);
  const [version, setVersion] = useState(detectedVersion);
  const [rows, setRows] = useState<CriteriaRow[]>(criteriaRows);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleToggleRowSelection = (id: string) => {
    // We can keep all or remove
    setRows(rows.filter((r) => r.id !== id));
  };

  const handleUpdateRowField = (id: string, field: keyof CriteriaRow, val: string) => {
    setRows(
      rows.map((r) => {
        if (r.id === id) {
          return { ...r, [field]: val };
        }
        return r;
      })
    );
  };

  const handleAddNewRow = () => {
    const newNr = `${rows.length + 1}`;
    const newRow: CriteriaRow = {
      id: `custom-row-${Date.now()}`,
      nr: newNr,
      bauteil: 'Neues Bauteil / Produktgruppe',
      anwendungsbereich: 'Innenraum / Gebäudehülle',
      betrachteteStoffe: 'VOC, SVHC',
      bezugsnorm: 'Standard-Prüfnorm',
      qs1: 'Stufe 1 Anforderung',
      qs2: 'Stufe 2 Anforderung',
      qs3: 'Stufe 3 Anforderung',
      qs4: 'Stufe 4 (Ziel / Höchststufe)',
      artDokumentation: 'Technisches Merkblatt, SDB',
      geltungsbereich: 'Neubau & Sanierung',
    };
    setRows([...rows, newRow]);
    setEditingId(newRow.id);
  };

  const handleSave = () => {
    onConfirmImport({
      name: standardName.trim() || 'Benutzerdefinierter Nachhaltigkeitsstandard',
      institute: institute.trim() || 'Eigenes Institut / Prüfstelle',
      version: version.trim() || new Date().getFullYear().toString(),
      rows,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-start justify-between bg-slate-50">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Dokument-Scan & Kriterienprüfung</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Gefundene Produktgruppen & Kriterien freigeben
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Prüfen Sie die aus dem PDF extrahierten Kriterien. Sie können Namen, Grenzwerte und Stufen editieren,
              bevor sie in das QM-Tool Nachhaltigkeit übernommen werden.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Standard Metadata inputs */}
        <div className="p-6 border-b border-slate-200 bg-white grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
              Standard- / Kriterienname
            </label>
            <input
              type="text"
              value={standardName}
              onChange={(e) => setStandardName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
              Herausgebendes Institut / Einrichtung
            </label>
            <input
              type="text"
              value={institute}
              onChange={(e) => setInstitute(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
              Versionsstand / Jahr
            </label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Criteria Rows List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              {rows.length} erkannte Kriterienzeilen
            </span>
            <button
              onClick={handleAddNewRow}
              className="px-3 py-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Zeile manuell hinzufügen</span>
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl">
              <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs text-slate-600">Keine Kriterien in der Liste.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row, idx) => {
                const isEditing = editingId === row.id;
                return (
                  <div
                    key={row.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center space-x-3">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                          {row.nr}
                        </span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={row.bauteil}
                            onChange={(e) => handleUpdateRowField(row.id, 'bauteil', e.target.value)}
                            className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-slate-900"
                          />
                        ) : (
                          <span className="text-xs font-bold text-slate-900">{row.bauteil}</span>
                        )}
                        {row.kategorie && (
                          <span className="text-[11px] text-slate-500 font-medium">· {row.kategorie}</span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingId(isEditing ? null : row.id)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-white rounded border border-transparent hover:border-slate-200 cursor-pointer"
                          title={isEditing ? 'Schließen' : 'Bearbeiten'}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleRowSelection(row.id)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded border border-transparent hover:border-rose-200 cursor-pointer"
                          title="Zeile entfernen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200 text-xs">
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
                            Stufe 1 (Basis)
                          </label>
                          <input
                            type="text"
                            value={row.qs1}
                            onChange={(e) => handleUpdateRowField(row.id, 'qs1', e.target.value)}
                            className="w-full p-1.5 bg-white border border-slate-200 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
                            Stufe 2 (Standard)
                          </label>
                          <input
                            type="text"
                            value={row.qs2}
                            onChange={(e) => handleUpdateRowField(row.id, 'qs2', e.target.value)}
                            className="w-full p-1.5 bg-white border border-slate-200 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
                            Stufe 3 (Hoch)
                          </label>
                          <input
                            type="text"
                            value={row.qs3}
                            onChange={(e) => handleUpdateRowField(row.id, 'qs3', e.target.value)}
                            className="w-full p-1.5 bg-white border border-slate-200 rounded text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-emerald-700 mb-0.5">
                            Stufe 4 (Ziel/Spitze)
                          </label>
                          <input
                            type="text"
                            value={row.qs4}
                            onChange={(e) => handleUpdateRowField(row.id, 'qs4', e.target.value)}
                            className="w-full p-1.5 bg-emerald-50/50 border border-emerald-300 rounded text-xs font-semibold text-emerald-950"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                        <div className="p-2 bg-white rounded border border-slate-200">
                          <span className="block text-[10px] uppercase font-bold text-slate-400">Stufe 1</span>
                          <span className="text-slate-700">{row.qs1}</span>
                        </div>
                        <div className="p-2 bg-white rounded border border-slate-200">
                          <span className="block text-[10px] uppercase font-bold text-slate-400">Stufe 2</span>
                          <span className="text-slate-700">{row.qs2}</span>
                        </div>
                        <div className="p-2 bg-white rounded border border-slate-200">
                          <span className="block text-[10px] uppercase font-bold text-slate-400">Stufe 3</span>
                          <span className="text-slate-700 font-medium">{row.qs3}</span>
                        </div>
                        <div className="p-2 bg-emerald-50/60 rounded border border-emerald-200">
                          <span className="block text-[10px] uppercase font-bold text-emerald-700">Stufe 4 (Ziel)</span>
                          <span className="text-emerald-950 font-semibold">{row.qs4}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {rows.length} Kriterien werden als Standard <strong>"{standardName}"</strong> eingepflegt.
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-xs transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>In Bewertungsmatrix übernehmen</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
