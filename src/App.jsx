import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { call, on } from './api.js'
import { accentVars } from './color.js'
import { toSquarePng, base64ToBlob } from './image.js'
import { Icon } from './components/Icon.jsx'
import { Medal } from './components/Medal.jsx'
import TitleBar from './components/TitleBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Sidebar from './components/Sidebar.jsx'
import Home from './pages/Home.jsx'
import Profiles from './pages/Profiles.jsx'
import Content from './pages/Content.jsx'
import Wardrobe from './pages/Wardrobe.jsx'
import Settings from './pages/Settings.jsx'
import Console from './pages/Console.jsx'

export default function App () {
  const [page, setPage] = useState('home')
  const [profiles, setProfiles] = useState([])
  const [settings, setSettings] = useState(null)
  const [accounts, setAccounts] = useState({ accounts: [], active: null })
  const [system, setSystem] = useState(null)
  const [selected, setSelected] = useState(null)
  const [progress, setProgress] = useState(null)
  const [running, setRunning] = useState([])
  const [logs, setLogs] = useState([])
  const [toast, setToast] = useState(null)
  const [contentTab, setContentTab] = useState('installed')

  const notify = useCallback((text, kind = 'info', extra = {}) => {
    setToast({ text, kind, id: Date.now(), ...extra })
  }, [])

  const refreshProfiles = useCallback(async () => {
    const list = await call('profiles:list')
    setProfiles(list)
    return list
  }, [])

  useEffect(() => {
    (async () => {
      const [list, s, a, sys, r] = await Promise.all([
        refreshProfiles(), call('settings:get'), call('auth:list'), call('system:info'), call('game:running')
      ])
      setSettings(s)
      setAccounts(a)
      setSystem(sys)
      setRunning(r)
      const last = [...list].sort((x, y) => (y.lastPlayed || 0) - (x.lastPlayed || 0))[0]
      setSelected(last?.id || null)
    })()
    const offs = [
      on('game:progress', p => setProgress(p)),
      on('game:log', line => setLogs(l => [...l.slice(-1500), line])),
      on('game:started', ({ profileId }) => {
        setProgress(null)
        setRunning(r => [...new Set([...r, profileId])])
        refreshProfiles()
      }),
      // Tiempo de juego: se actualiza cada minuto mientras juegas
      on('game:playtime', () => refreshProfiles()),
      // Medalla nueva al llegar a un hito de horas
      on('game:medal', ({ hours, profileName }) => {
        notify(`¡Nueva medalla! Has llegado a ${hours} horas jugadas. Se queda en «${profileName}».`, 'medal', { medal: hours })
        refreshProfiles()
      }),
      on('game:closed', ({ profileId, code }) => {
        setRunning(r => r.filter(id => id !== profileId))
        refreshProfiles()
        if (code && code !== 0) notify(`El juego se cerró con un error (código ${code}). Revisa la consola.`, 'error')
      })
    ]
    return () => offs.forEach(off => off())
  }, [])

  useEffect(() => {
    if (!toast) return
    // Las medallas se quedan más tiempo en pantalla
    const t = setTimeout(() => setToast(null), toast.medal ? 9000 : 4500)
    return () => clearTimeout(t)
  }, [toast])

  // El color principal y sus variantes legibles se aplican a toda la interfaz
  useEffect(() => {
    if (!settings) return
    for (const [k, v] of Object.entries(accentVars(settings.accent))) document.documentElement.style.setProperty(k, v)
    document.documentElement.dataset.bg = settings.background
  }, [settings?.accent, settings?.background])

  const updateSettings = async (changes) => {
    setSettings(s => ({ ...s, ...changes }))
    setSettings(await call('settings:set', changes))
  }

  const launch = async (profileId = selected) => {
    if (!profileId) return setPage('profiles')
    if (!accounts.active) return notify('Inicia sesión con tu cuenta de Microsoft para jugar', 'error')
    setLogs([])
    setProgress({ stage: 'Preparando…', current: 0, total: 0 })
    try {
      await call('game:launch', profileId)
    } catch (e) {
      setProgress(null)
      notify(e.message, 'error')
    }
  }

  // Abre directamente los mods de un perfil
  const openMods = (profileId, tab = 'installed') => {
    setSelected(profileId)
    setContentTab(tab)
    setPage('content')
  }

  // Pone como foto de perfil una imagen que llega del proceso principal (p. ej. el icono de un modpack)
  const applyIcon = async (profileId, icon) => {
    if (!icon) return
    try {
      const png = await toSquarePng(base64ToBlob(icon.base64, icon.mime))
      await call('profiles:setIcon', profileId, png)
    } catch { /* si la imagen no se puede leer, el perfil se queda con su inicial */ }
  }

  const ctx = {
    profiles, refreshProfiles, settings, updateSettings, accounts, setAccounts, system,
    selected, setSelected, launch, progress, running, logs, notify, setPage, openMods, applyIcon,
    contentTab, setContentTab
  }

  const selectedProfile = useMemo(() => profiles.find(p => p.id === selected), [profiles, selected])

  if (!settings) return <div className="boot"><div className="spinner" /></div>

  return (
    <div className="app">
      <div className="bg" />
      <TitleBar />
      <div className="layout">
        <Sidebar page={page} setPage={setPage} ctx={ctx} />
        <main className="main">
          <ErrorBoundary resetKey={page}>
          <div key={page} className="page-anim">
            {page === 'home' && <Home ctx={ctx} profile={selectedProfile} />}
            {page === 'profiles' && <Profiles ctx={ctx} />}
            {page === 'content' && <Content ctx={ctx} />}
            {page === 'wardrobe' && <Wardrobe ctx={ctx} />}
            {page === 'settings' && <Settings ctx={ctx} />}
            {page === 'console' && <Console ctx={ctx} />}
          </div>
          </ErrorBoundary>
        </main>
      </div>
      {toast && (
        <div key={toast.id} className={`toast ${toast.kind}`} onClick={() => setToast(null)}>
          {toast.medal ? <Medal hours={toast.medal} size={30} /> : <Icon name={toast.kind === 'error' ? 'alert' : 'check'} />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  )
}
