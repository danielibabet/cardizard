import React, { useState } from 'react';

export default function Result({ result, onReset }) {
  const [variantIndex, setVariantIndex] = useState(0);

  if (!result || !result.variants || result.variants.length === 0) return null;

  const currentVariant = result.variants[variantIndex];
  const hasMultiple = result.variants.length > 1;

  const handleNextVariant = () => {
    setVariantIndex((prev) => (prev + 1) % result.variants.length);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto space-y-6 animate-fade-in pb-8">
      
      {currentVariant.imageUrl && (
        <div className="w-48 shadow-2xl rounded-xl">
          <img src={currentVariant.imageUrl} alt={currentVariant.name} className="w-full h-auto rounded-xl" />
        </div>
      )}

      <div className="w-full p-6 space-y-4 bg-gray-800 shadow-xl rounded-2xl border border-gray-700">
        <h2 className="text-2xl font-bold text-center text-white">{currentVariant.name}</h2>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex flex-col p-3 bg-gray-700 rounded-xl">
            <span className="text-xs text-gray-400 uppercase">Expansión</span>
            <span className="font-semibold text-white">{currentVariant.set}</span>
          </div>
          <div className="flex flex-col p-3 bg-gray-700 rounded-xl">
            <span className="text-xs text-gray-400 uppercase">Rareza</span>
            <span className="font-semibold text-white">{currentVariant.rarity}</span>
          </div>
        </div>

        <div className="flex flex-col items-center p-4 bg-green-900/30 rounded-xl border border-green-800">
          <span className="text-xs font-semibold text-green-400 uppercase">Precio Mercado ({currentVariant.priceSource || 'Cardmarket'})</span>
          <span className="text-3xl font-bold text-green-400">{currentVariant.price}</span>
        </div>

        {hasMultiple && (
          <button 
            onClick={handleNextVariant}
            className="w-full py-2 text-sm font-semibold text-blue-400 bg-blue-900/30 border border-blue-800 rounded-lg hover:bg-blue-800/50"
          >
            ¿No es esta? Ver otra variante ({variantIndex + 1}/{result.variants.length})
          </button>
        )}

        {result.lines && result.lines.length > 0 && (
          <div className="mt-4 p-3 text-xs text-left text-gray-400 bg-gray-900 rounded-lg border border-gray-700">
            <p className="font-bold mb-1">Raw Textract (Debug):</p>
            <ul className="list-disc pl-4">
              {result.lines.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </div>
        )}
      </div>

      <button 
        onClick={onReset}
        className="w-full py-4 text-lg font-bold text-white transition-colors bg-gray-700 rounded-full shadow hover:bg-gray-600 active:scale-95"
      >
        Escanear otra carta
      </button>
    </div>
  );
}
