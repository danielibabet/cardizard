import React, { useRef, useState, useEffect } from 'react';

export default function Scanner({ onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);
  const [stream, setStream] = useState(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      // Pedimos la máxima resolución posible a la cámara del móvil (ideal 4K/1080p)
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 3840 },
          height: { ideal: 2160 }
        } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError("No se pudo acceder a la cámara. Por favor, concede los permisos.");
      console.error(err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convertimos el frame a JPEG con calidad casi máxima (0.95) para que Textract pueda leer los textos más pequeños
    canvas.toBlob((blob) => {
      if (blob) {
        stopCamera();
        onCapture(blob);
      }
    }, 'image/jpeg', 0.95);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 p-4 text-center text-red-600 bg-red-100 rounded-xl">
        <p className="font-semibold">{error}</p>
        <button 
          onClick={startCamera}
          className="px-4 py-2 mt-4 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto space-y-6">
      <div className="relative w-full overflow-hidden bg-black rounded-2xl aspect-[3/4] shadow-lg border-4 border-gray-800">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className="object-cover w-full h-full"
        />
        {/* Guía visual para la carta */}
        <div className="absolute inset-0 z-10 pointer-events-none border-[3px] border-white/50 rounded-xl m-6"></div>
      </div>
      
      <canvas ref={canvasRef} className="hidden" />

      <button 
        onClick={capture}
        className="w-full py-4 text-lg font-bold text-white transition-colors bg-red-600 rounded-full shadow-lg hover:bg-red-700 active:scale-95"
      >
        Escanear Carta
      </button>
    </div>
  );
}
