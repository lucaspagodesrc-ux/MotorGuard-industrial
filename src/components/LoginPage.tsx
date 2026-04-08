import React, { useState } from 'react';
import { 
  Mail, 
  Lock, 
  LogIn, 
  ShieldCheck, 
  Settings2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { auth } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      // Force account selection every time
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      onLogin();
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-industrial-mesh font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-surface-container-lowest rounded-xl shadow-2xl shadow-primary/5"
      >
        {/* Branding & Context Side */}
        <div className="hidden lg:flex lg:col-span-7 relative flex-col justify-between p-12 bg-primary overflow-hidden">
          {/* Decorative Background Overlay */}
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <img 
              className="w-full h-full object-cover" 
              alt="Technical blueprint" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuABgp5tCv4guT2YWHSUb7gRn9IsxH_NzQdmSSOOGfwXafnjJ-C_UR4WgAcbcObuCSUTca42mRJLztyXsOtycpvB8vpyDw5IOnM4iY7QbcwVSdqqZPGsrj0Bp97v9okgYrwYjTJK3mfKpCFolJHSk6Ts2YEu_vWExXmb4YB0ZSWdvACcaeAc15U5jnc1QntoZCCULgzWb5dABRaLiFkeSY9b49LzAoLZsz9QsvNJUm5bwBxDO5JcesiKwAU5NumB-HgS0VUKWWtxX0T6"
              referrerPolicy="no-referrer"
            />
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white flex items-center justify-center rounded-lg shadow-inner">
                <Settings2 className="text-primary w-6 h-6" />
              </div>
              <span className="text-2xl font-extrabold tracking-tighter text-white uppercase">MotorGuard Industrial</span>
            </div>
          </div>

          <div className="relative z-10">
            <h1 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight mb-6">
              Mantenha a Operação em <br/>
              <span className="text-on-primary-container">Fluxo Contínuo.</span>
            </h1>
            <p className="text-slate-300 text-lg max-w-md font-medium leading-relaxed">
              Acesso exclusivo para inspetores e técnicos de manutenção. Monitore a saúde dos ativos em tempo real com precisão industrial.
            </p>
          </div>
        </div>

        {/* Login Form Side */}
        <div className="lg:col-span-5 p-8 sm:p-12 md:p-16 flex flex-col justify-center bg-surface-container-lowest">
          <div className="lg:hidden mb-12">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-primary w-8 h-8" />
              <span className="text-xl font-extrabold tracking-tighter text-primary uppercase">MotorGuard</span>
            </div>
          </div>

          <div className="mb-10">
            <h2 className="text-2xl font-bold text-on-surface tracking-tight mb-2">Autenticação de Inspetor</h2>
            <p className="text-on-surface-variant text-sm font-medium">Faça login com sua conta corporativa para acessar o terminal.</p>
          </div>

          <div className="space-y-6">
            <button 
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-primary-container text-white py-4 px-6 rounded-lg font-bold text-sm uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:translate-y-[-1px] active:scale-95 transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-50" 
            >
              <LogIn className="w-5 h-5" />
              <span>{loading ? 'Autenticando...' : 'Entrar com Google'}</span>
            </button>
          </div>

          <div className="mt-12 pt-8 border-t border-surface-container-high">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                <span className="text-xs font-semibold text-on-surface-variant">Sistemas de Monitoramento Online</span>
              </div>
              <p className="text-[0.6875rem] text-outline leading-tight font-medium">
                Este acesso é monitorado pela Política de Segurança Industrial. Tentativas de acesso não autorizadas serão registradas e reportadas ao setor de TI.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating Security Tag */}
      <div className="fixed bottom-6 right-6 hidden md:flex items-center gap-3 bg-white px-4 py-2 rounded-full shadow-md border border-outline-variant/10">
        <ShieldCheck className="text-primary w-4 h-4" />
        <span className="text-[0.625rem] font-bold text-on-surface-variant uppercase tracking-tighter">Conexão Segura AES-256</span>
      </div>
    </div>
  );
}
