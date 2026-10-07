import {AccountGate} from './components/account-gate'
import React from 'react'
import {createRoot} from 'react-dom/client'
import {TooltipProvider} from '@/components/ui/tooltip'
import DukkanApp from './DukkanApp'
import './index.css'
import './dashboard.css'
import './chat.css'
import './agent-shell.css'
import './dukkan-app.css'
import './customer-shell.css'
class ErrorBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true}}render(){return this.state.failed?<main className="load-error"><h1>The workspace couldn’t open.</h1><p>Your browser records have not been deleted. Reload to try again.</p><button onClick={()=>location.reload()}>Reload</button><a href="./?view=home">Return to overview</a></main>:this.props.children}}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><TooltipProvider><AccountGate><DukkanApp/></AccountGate></TooltipProvider></ErrorBoundary></React.StrictMode>)
