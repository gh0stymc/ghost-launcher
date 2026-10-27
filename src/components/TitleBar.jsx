import React from 'react'
import { call } from '../api.js'
import { Icon } from './Icon.jsx'

// Barra superior fina: solo sirve para arrastrar la ventana y los botones de ventana
export default function TitleBar () {
  return (
    <header className="titlebar">
      <div className="window-buttons">
        <button onClick={() => call('window:minimize')} aria-label="Minimizar"><Icon name="minus" size={15} /></button>
        <button onClick={() => call('window:maximize')} aria-label="Maximizar"><Icon name="square" size={12} /></button>
        <button className="close" onClick={() => call('window:close')} aria-label="Cerrar"><Icon name="x" size={15} /></button>
      </div>
    </header>
  )
}
