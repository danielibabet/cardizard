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

      <div className="w-full p-6 space-y-4 bg-white shadow-xl rounded-2xl">
        <h2 className="text-2xl font-bold text-center text-gray-800">{currentVariant.name}</h2>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex flex-col p-3 bg-gray-50 rounded-xl">
            <span className="text-xs text-gray-500 uppercase">Expansión</span>
            <span className="font-semibold text-gray-800">{currentVariant.set}</span>
          </div>
          <div className="flex flex-col p-3 bg-gray-50 rounded-xl">
            <span className="text-xs text-gray-500 uppercase">Rareza</span>
            <span className="font-semibold text-gray-800">{currentVariant.rarity}</span>
          </div>
        </div>

        <div className="flex flex-col items-center p-4 bg-green-50 rounded-xl border border-green-100">
          <span className="text-xs font-semibold text-green-600 uppercase">Precio Mercado ({currentVariant.priceSource || 'Cardmarket'})</span>
          <span className="text-3xl font-bold text-green-700">{currentVariant.price}</span>
        </div>

        {hasMultiple && (
          <button 
            onClick={handleNextVariant}
            className="w-full py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
          >
            ¿No es esta? Ver otra variante ({variantIndex + 1}/{result.variants.length})
          </button>
        )}

        {result.lines && result.lines.length > 0 && (
          <div className="mt-4 p-3 text-xs text-left text-gray-600 bg-gray-100 rounded-lg">
            <p className="font-bold mb-1">Raw Textract (Debug):</p>
            <ul className="list-disc pl-4">
              {result.lines.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </div>
        )}
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
