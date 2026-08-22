import re

with open(r'e:\Project\cloud-pulse-app\frontend\src\pages\config\ConfigPage.js', 'r') as f:
    content = f.read()

# 1. Update imports
content = content.replace("from '../../api/config';", ", editConfig } from '../../api/config';")

# 2. Add AVAILABLE_MODULES before initialProviderForm
modules_decl = """
const AVAILABLE_MODULES = [
  { id: 'inventory', label: 'Inventory Discovery' },
  { id: 'control', label: 'Control Automation' }
];

const initialProviderForm = {
"""
content = content.replace("const initialProviderForm = {", modules_decl)

# 3. Add active_modules to initialProviderForm
content = content.replace("activeProvider: 'aws',", "activeProvider: 'aws',\n  active_modules: ['inventory', 'control'],")

# 4. Add editing state
content = content.replace("const [saving, setSaving] = useState(false);", "const [saving, setSaving] = useState(false);\n  const [editingConfigId, setEditingConfigId] = useState(null);")

# 5. Update handleSave
old_save = """    setSaving(true);
    try {
      const payload = {
        provider: providerForm.activeProvider,
        account_name: activeData.account_name,
        default_region: providerForm.activeProvider === 'aws' ? activeData.region : 'global',
        credentials: { ...activeData }
      };"""

new_save = """    setSaving(true);
    try {
      if (editingConfigId) {
        const payload = {
          account_name: activeData.account_name,
          active_modules: providerForm.active_modules.join(','),
        };
        if (providerForm.activeProvider === 'aws') payload.default_region = activeData.region;
        await editConfig(editingConfigId, payload);
        toast.success('Config updated');
      } else {
        const payload = {
          provider: providerForm.activeProvider,
          account_name: activeData.account_name,
          default_region: providerForm.activeProvider === 'aws' ? activeData.region : 'global',
          credentials: { ...activeData },
          active_modules: providerForm.active_modules.join(',')
        };"""

content = content.replace(old_save, new_save)

# Update the end of handleSave try block
old_try_end = """      await createConfig(payload);
      toast.success(`${providerForm.activeProvider.toUpperCase()} config saved`);
      setShowForm(false);
      setProviderForm(initialProviderForm);
      await load();
    } catch (e) {"""

new_try_end = """        await createConfig(payload);
        toast.success(`${providerForm.activeProvider.toUpperCase()} config saved`);
      }
      setShowForm(false);
      setProviderForm(initialProviderForm);
      setEditingConfigId(null);
      await load();
    } catch (e) {"""
content = content.replace(old_try_end, new_try_end)

# Add handleEdit function before handleVerify
handle_edit = """  const handleEditConfig = (c) => {
    setEditingConfigId(c.id);
    const form = { ...initialProviderForm, activeProvider: c.provider.toLowerCase(), active_modules: (c.active_modules || 'inventory,control').split(',').filter(Boolean) };
    if (c.provider.toLowerCase() === 'aws') form.aws = { ...form.aws, account_name: c.account_name, region: c.region };
    else if (c.provider.toLowerCase() === 'azure') form.azure = { ...form.azure, account_name: c.account_name };
    else if (c.provider.toLowerCase() === 'gcp') form.gcp = { ...form.gcp, account_name: c.account_name };
    setProviderForm(form);
    setShowForm(true);
  };

  const handleVerify"""
content = content.replace("  const handleVerify", handle_edit)

# Update Cancel button
content = content.replace("setShowForm(false); setProviderForm(initialProviderForm);", "setShowForm(false); setProviderForm(initialProviderForm); setEditingConfigId(null);")
content = content.replace("setShowForm(!showForm); if (showForm) setProviderForm(initialProviderForm);", "setShowForm(!showForm); if (showForm) { setProviderForm(initialProviderForm); setEditingConfigId(null); }")

# Form UI - Add module checkboxes at the end of the form, before buttons
buttons_html = """          <div className="flex gap-2">
            <button onClick={handleSave}"""

modules_html = """          <div className="pt-2 border-t border-zinc-800/80">
            <label className="text-[10px] text-zinc-500 uppercase block mb-2">Active Modules</label>
            <div className="flex gap-4">
              {AVAILABLE_MODULES.map(m => (
                <label key={m.id} className="flex items-center gap-2 text-xs text-zinc-300">
                  <input type="checkbox" checked={providerForm.active_modules.includes(m.id)} 
                         onChange={e => {
                           let next = [...providerForm.active_modules];
                           if (e.target.checked) next.push(m.id);
                           else next = next.filter(i => i !== m.id);
                           setProviderForm({...providerForm, active_modules: next});
                         }}
                         className="rounded" />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
          
          <div className="flex gap-2">
            <button onClick={handleSave}"""

content = content.replace(buttons_html, modules_html)

# Add badges for active_modules below account name in list
old_list_name = """                  <span className="text-sm text-white font-medium">{c.account_name}</span>"""
new_list_name = """                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium">{c.account_name}</span>
                    <div className="flex gap-1">
                      {(c.active_modules || 'inventory,control').split(',').filter(Boolean).map(m => (
                        <span key={m} className="text-[8px] uppercase px-1.5 py-0.5 rounded-sm bg-zinc-800 text-zinc-400 border border-zinc-700">{m}</span>
                      ))}
                    </div>
                  </div>"""
content = content.replace(old_list_name, new_list_name)

# Add Edit button in the list
old_actions = """<button onClick={() => {
                  if (editingSync === c.id) setEditingSync(null);"""
new_actions = """<button onClick={() => handleEditConfig(c)} className="text-[10px] text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-zinc-800">Edit</button>
                <button onClick={() => {
                  if (editingSync === c.id) setEditingSync(null);"""
content = content.replace(old_actions, new_actions)


# Hide credentials block in edit mode
content = content.replace("{/* AWS Block */}", "{!editingConfigId && (\n          <>\n          {/* AWS Block */}")
content = content.replace("{/* GCP Block */}", "{/* GCP Block */}")
content = content.replace('placeholder={\'{\\n  "type": "service_account",\\n  "project_id": "...",\\n  "private_key": "..."\\n}\'} /></div>\n            </div>\n          )}', 'placeholder={\'{\\n  "type": "service_account",\\n  "project_id": "...",\\n  "private_key": "..."\\n}\'} /></div>\n            </div>\n          )}\n          </>\n          )}')

# Make provider dropdown disabled when editing
content = content.replace('<select value={providerForm.activeProvider} onChange={e => setProviderForm({ ...initialProviderForm, activeProvider: e.target.value })} className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white">', '<select value={providerForm.activeProvider} onChange={e => setProviderForm({ ...initialProviderForm, activeProvider: e.target.value })} disabled={!!editingConfigId} className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white disabled:opacity-50">')

with open(r'e:\Project\cloud-pulse-app\frontend\src\pages\config\ConfigPage.js', 'w') as f:
    f.write(content)
