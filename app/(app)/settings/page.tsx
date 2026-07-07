'use client';

import { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { apiFetch, swrFetcher } from '@/lib/api-client';
import type { UserSettings } from '@/shared/types';

export default function SettingsPage() {
  const { data, isLoading } = useSWR<UserSettings>('/api/user-settings', swrFetcher);
  const [form, setForm] = useState<UserSettings>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch('/api/user-settings', {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      mutate('/api/user-settings');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert(`存檔失敗:${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <div className="p-8 text-slate-400">載入中…</div>;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">設定</h1>

      <Section title="AI Model">
        <p className="text-xs text-slate-500 mb-3">
          未來 Anthropic 或 Google 換新模型,你可以在這裡直接改字串。
          不用改程式碼、不用重新部署。舊寫死的 model ID 被停售時就是這樣繞過。
        </p>
        <Field
          label="Claude Model ID"
          hint="例:claude-sonnet-4-6, claude-opus-4-8"
          value={form.claudeModel ?? ''}
          onChange={(v) => setForm({ ...form, claudeModel: v })}
        />
        <Field
          label="Gemini Model ID"
          hint="例:gemini-2.5-flash, gemini-2.5-pro"
          value={form.geminiModel ?? ''}
          onChange={(v) => setForm({ ...form, geminiModel: v })}
        />
      </Section>

      <Section title="投資組合">
        <NumberField
          label="戰備現金(NT$)"
          hint="給 AI 分析建議部位大小時參考"
          value={form.reserveCash ?? 0}
          onChange={(v) => setForm({ ...form, reserveCash: v })}
        />
      </Section>

      <Section title="雷達評分">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Score Preset</label>
          <select
            value={form.radarScorePreset ?? 'balanced'}
            onChange={(e) => setForm({ ...form, radarScorePreset: e.target.value })}
            className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm"
          >
            <option value="balanced">平衡</option>
            <option value="inst">重法人</option>
            <option value="tech">重技術</option>
            <option value="swing">波段</option>
          </select>
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium"
        >
          {saving ? '存檔中…' : '儲存'}
        </button>
        {saved && <span className="text-emerald-400 text-sm">✓ 已儲存</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
      <h2 className="text-sm font-medium text-slate-300">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm font-mono"
      />
      {hint && <p className="text-[11px] text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm tabular-nums"
      />
      {hint && <p className="text-[11px] text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}
