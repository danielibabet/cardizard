import React, { useState } from 'react';
import Scanner from './components/Scanner';
import Result from './components/Result';
import { getPresignedUrl, uploadImageToS3, analyzeImage } from './api';
import logo from './assets/cardizard-logo.png';
import './index.css';

function App() {
  const [step, setStep] = useState('SCANNING'); // SCANNING, LOADING, RESULT, ERROR
  const [loadingText, setLoadingText] = useState('');
  const [resultData, setResultData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleCapture = async (blob) => {
    try {
      setStep('LOADING');
      
      setLoadingText('Conectando con el servidor...');
      const { uploadUrl, imageId } = await getPresignedUrl();
      
      setLoadingText('Subiendo imagen segura...');
      await uploadImageToS3(uploadUrl, blob);
      
      setLoadingText('Analizando carta mágica...');
      const result = await analyzeImage(imageId);
      
      setResultData(result);
      setStep('RESULT');
    } catch (error) {
      console.error(error);
      setErrorMsg('Ocurrió un error al procesar tu carta. Intenta con otra foto clara e iluminada.');
      setStep('ERROR');
    }
  };

  const handleReset = () => {
    setResultData(null);
    setErrorMsg('');
    setStep('SCANNING');
  };

  return (
    <div className="min-h-screen p-4 bg-gray-900 text-white flex flex-col font-sans">
      <header className="py-6 flex flex-col items-center text-center">
        <img src={logo} alt="Cardizard Logo" className="h-16 mb-2 drop-shadow-md" />
        <p className="mt-2 text-sm text-gray-400">Pokémon TCG Scanner</p>
      </header>

      <main className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        {step === 'SCANNING' && (
          <Scanner onCapture={handleCapture} />
        )}

        {step === 'LOADING' && (
          <div className="flex flex-col items-center justify-center p-8 space-y-6 bg-gray-800 shadow-xl rounded-2xl animate-pulse border border-gray-700">
            <div className="w-16 h-16 border-4 border-red-500 rounded-full border-t-transparent animate-spin"></div>
            <p className="text-lg font-semibold text-gray-300">{loadingText}</p>
          </div>
        )}

        {step === 'RESULT' && (
          <Result result={resultData} onReset={handleReset} />
        )}

        {step === 'ERROR' && (
          <div className="flex flex-col items-center justify-center p-6 text-center bg-gray-800 shadow-xl rounded-2xl border border-red-900/50">
            <div className="w-16 h-16 mb-4 text-red-500">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <p className="mb-6 font-medium text-gray-300">{errorMsg}</p>
            <button 
              onClick={handleReset}
              className="px-6 py-3 font-bold text-white transition-colors bg-red-600 rounded-full hover:bg-red-700 active:scale-95"
            >
              Volver a intentar
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
