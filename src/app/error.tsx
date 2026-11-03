"use client"

import { useEffect } from "react"
import Link from "next/link"
import { RotateCcw, TriangleAlert } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"

// Límite de errores inesperados de toda la aplicación (zona pública y paneles).
// No muestra el detalle técnico: solo un identificador para soporte (digest).
export default function ErrorInesperado({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] error inesperado", error.digest ?? "", error.message)
  }, [error])

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-5 py-20">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-3xl bg-card p-8 text-center text-card-foreground shadow-sm ring-1 ring-border">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-[#FF6B5B] text-[#1B1446]">
          <TriangleAlert className="size-7" aria-hidden />
        </span>
        <h1 className="text-2xl font-extrabold text-balance">Algo no salió como esperábamos</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          No pudimos completar esta acción. Inténtalo de nuevo; si el problema continúa, avisa al administrador de tu institución.
        </p>
        {error.digest && <p className="font-mono text-xs text-muted-foreground">Referencia: {error.digest}</p>}
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>
            <RotateCcw aria-hidden />
            Reintentar
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  )
}
