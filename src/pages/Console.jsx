import React, { useEffect, useRef, useState } from 'react'
import { t } from '../i18n.js'
import { Empty } from '../components/ui.jsx'

export default function Console ({ ctx }) {
  const { logs } = ctx
  const [filter, setFilter] = useState('')
  const [follow, setFollow] = useState(true)
  const box = useRef()

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [logs, follow])

  const shown = filter ? logs.filter(l => l.toLowerCase().includes(filter.toLowerCase())) : logs
  const cls = (l) => /error|exception|fatal/i.test(l) ? 'err' : /warn/i.test(l) ? 'warn' : /\[MCLC\]/.test(l) ? 'dim' : ''

  return (
    <div className="page console-page">
      <div className="page-head">
        <div>
          <h1>{t('Consola')}</h1>
          <p className="muted">{t('Lo que va diciendo el juego. Útil si algo falla.')}</p>
        </div>
        <div className="row">
          <input className="console-filter" placeholder={t('Filtrar…')} value={filter} onChange={e => setFilter(e.target.value)} />
          <button className="btn small ghost" onClick={() => navigator.clipboard.writeText(logs.join(''))}>{t('Copiar')}</button>
          <label className="row small-text"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} /> {t('Seguir')}</label>
        </div>
      </div>
      {logs.length === 0
        ? <Empty icon="terminal" title={t('Sin registros')} text={t('Aparecerán aquí cuando lances el juego.')} />
        : (
          <pre className="console" ref={box}>
            {shown.map((l, i) => <span key={i} className={cls(l)}>{l.endsWith('\n') ? l : l + '\n'}</span>)}
          </pre>
          )}
    </div>
  )
}
