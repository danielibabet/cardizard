import React from 'react';

export default function Result({ result, onReset }) {
  if (!result) return null;

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto space-y-6 animate-fade-in">
      
      {result.imageUrl && (
        <div className="w-48 shadow-2xl rounded-xl">
          <img src={result.imageUrl} alt={result.name} className="w-full h-auto rounded-xl" />
        </div>
      )}

      <div className="w-full p-6 space-y-4 bg-white shadow-xl rounded-2xl">
        <h2 className="text-2xl font-bold text-center text-gray-800">{result.name}</h2>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex flex-col p-3 bg-gray-50 rounded-xl">
            <span className="text-xs text-gray-500 uppercase">Expansión</span>
            <span className="font-semibold text-gray-800">{result.set}</span>
          </div>
          <div className="flex flex-col p-3 bg-gray-50 rounded-xl">
            <span className="text-xs text-gray-500 uppercase">Rareza</span>
            <span className="font-semibold text-gray-800">{result.rarity}</span>
          </div>
        </div>

        <div className="flex flex-col items-center p-4 bg-green-50 rounded-xl border border-green-100">
          <span className="text-xs font-semibold text-green-600 uppercase">Precio Mercado (Cardmarket)</span>
          <span className="text-3xl font-bold text-green-700">{result.price}</span>
        </div>
      </div>

      <button 
        onClick={onReset}
        className="w-full py-4 text-lg font-bold text-gray-700 transition-colors bg-gray-200 rounded-full shadow hover:bg-gray-300 active:scale-95"
      >
        Escanear otra carta
      </button>
    </div>
  );
}
