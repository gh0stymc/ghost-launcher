import React from 'react'
import { t } from '../i18n.js'
import { Icon } from './Icon.jsx'

// Si una sección falla, se muestra un aviso solo en esa sección en vez de dejar la ventana en negro
export default class ErrorBoundary extends React.Component {
  constructor (props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError (error) {
    return { error }
  }

  componentDidCatch (error, info) {
    console.error('[Ghost Launcher] Error en la interfaz:', error, info?.componentStack)
  }

  componentDidUpdate (prev) {
    // Al cambiar de sección se vuelve a intentar
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render () {
    if (!this.state.error) return this.props.children
    return (
      <div className="page">
        <div className="empty">
          <div className="empty-icon"><Icon name="alert" size={28} /></div>
          <h3>{t('Algo ha fallado en esta sección')}</h3>
          <p>{t('El resto del launcher sigue funcionando. Prueba otra sección o vuelve a abrir esta.')}</p>
          <code className="error-detail">{String(this.state.error?.message || this.state.error)}</code>
          <button className="btn" onClick={() => this.setState({ error: null })}><Icon name="refresh" /> {t('Reintentar')}</button>
        </div>
      </div>
    )
  }
}
