import React, { useState } from 'react';
import Scanner from './components/Scanner';
import Result from './components/Result';
import { getPresignedUrl, uploadImageToS3, analyzeImage } from './api';
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
    <div className="min-h-screen p-4 bg-gray-100 flex flex-col font-sans">
      <header className="py-6 text-center">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-yellow-500">
          Cardizard
        </h1>
        <p className="mt-2 text-sm text-gray-500">Pokémon TCG Scanner</p>
      </header>

      <main className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        {step === 'SCANNING' && (
          <Scanner onCapture={handleCapture} />
        )}

        {step === 'LOADING' && (
          <div className="flex flex-col items-center justify-center p-8 space-y-6 bg-white shadow-xl rounded-2xl animate-pulse">
            <div className="w-16 h-16 border-4 border-red-500 rounded-full border-t-transparent animate-spin"></div>
            <p className="text-lg font-semibold text-gray-700">{loadingText}</p>
          </div>
        )}

        {step === 'RESULT' && (
          <Result result={resultData} onReset={handleReset} />
        )}

        {step === 'ERROR' && (
          <div className="flex flex-col items-center justify-center p-6 text-center bg-white shadow-xl rounded-2xl border border-red-100">
            <div className="w-16 h-16 mb-4 text-red-500">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <p className="mb-6 font-medium text-gray-800">{errorMsg}</p>
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
