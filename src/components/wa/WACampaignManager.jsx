import { useState } from 'react'

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

const COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
]

export default function WACampaignManager({ campaigns, setCampaigns, templateNames, theme }) {
  const isDark = theme === 'dark'
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [formName, setFormName] = useState('')
  const [formTemplates, setFormTemplates] = useState([])

  const wrapClass = `rounded-xl border ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow'}`
  const inputClass = `w-full rounded-lg border px-3 py-2 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' : 'bg-white border-slate-200 text-slate-900'}`

  function openCreate() {
    setEditId(null)
    setFormName('')
    setFormTemplates([])
    setShowForm(true)
  }

  function openEdit(c) {
    setEditId(c.id)
    setFormName(c.name)
    setFormTemplates([...c.templates])
    setShowForm(true)
  }

  function handleSave() {
    if (!formName.trim() || formTemplates.length === 0) return
    if (editId) {
      setCampaigns((prev) => prev.map((c) => c.id === editId ? { ...c, name: formName.trim(), templates: formTemplates } : c))
    } else {
      const color = COLORS[campaigns.length % COLORS.length]
      setCampaigns((prev) => [...prev, { id: generateId(), name: formName.trim(), templates: formTemplates, color }])
    }
    setShowForm(false)
    setFormName('')
    setFormTemplates([])
    setEditId(null)
  }

  function handleDelete(id) {
    setCampaigns((prev) => prev.filter((c) => c.id !== id))
  }

  function toggleTemplate(t) {
    setFormTemplates((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])
  }

  return (
    <div className={wrapClass}>
      <div className={`px-4 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-200'} flex items-center justify-between`}>
        <div>
          <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Campaign groups</h3>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Tag 2–3 templates together to track a campaign</p>
        </div>
        <button
          onClick={openCreate}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            isDark ? 'bg-violet-700/40 border-violet-600 text-violet-300 hover:bg-violet-700/70' : 'bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New campaign
        </button>
      </div>

      {/* Campaign list */}
      <div className="p-4 space-y-2">
        {campaigns.length === 0 && !showForm && (
          <p className={`text-sm text-center py-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            No campaigns yet. Click <strong>New campaign</strong> to group templates.
          </p>
        )}
        {campaigns.map((c, idx) => (
          <div
            key={c.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${isDark ? 'border-slate-700 bg-slate-700/30' : 'border-slate-200 bg-slate-50'}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.color || COLORS[idx % COLORS.length]}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{c.name}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {c.templates.map((t) => (
                  <span key={t} className={`px-1.5 py-0.5 rounded text-[11px] font-mono ${isDark ? 'bg-slate-600 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>{t}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => openEdit(c)}
                className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-600 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                title="Edit"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button
                onClick={() => handleDelete(c.id)}
                className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-rose-800/40 text-slate-400 hover:text-rose-400' : 'hover:bg-rose-50 text-slate-400 hover:text-rose-600'}`}
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}

        {/* Form */}
        {showForm && (
          <div className={`rounded-xl border p-4 space-y-3 mt-2 ${isDark ? 'border-violet-700/50 bg-slate-700/30' : 'border-violet-200 bg-violet-50/50'}`}>
            <p className={`text-xs font-semibold ${isDark ? 'text-violet-300' : 'text-violet-700'}`}>{editId ? 'Edit campaign' : 'New campaign'}</p>
            <div>
              <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Campaign name</label>
              <input
                type="text"
                placeholder="e.g. Diwali 2025"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Select templates ({formTemplates.length} selected)
              </label>
              {templateNames.length === 0 ? (
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No templates found in data yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {templateNames.map((t) => {
                    const selected = formTemplates.includes(t)
                    return (
                      <button
                        key={t}
                        onClick={() => toggleTemplate(t)}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors font-mono ${
                          selected
                            ? isDark ? 'bg-violet-700 border-violet-500 text-violet-100' : 'bg-violet-600 border-violet-600 text-white'
                            : isDark ? 'bg-slate-700 border-slate-600 text-slate-300 hover:border-violet-500' : 'bg-white border-slate-300 text-slate-600 hover:border-violet-400'
                        }`}
                      >
                        {selected && <span className="mr-1">✓</span>}{t}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={!formName.trim() || formTemplates.length === 0}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  !formName.trim() || formTemplates.length === 0
                    ? 'opacity-40 cursor-not-allowed bg-violet-500 text-white'
                    : isDark ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-violet-600 text-white hover:bg-violet-700'
                }`}
              >
                {editId ? 'Save changes' : 'Create campaign'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditId(null) }}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  isDark ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
