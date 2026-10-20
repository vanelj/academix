type EstadoVacioProps = {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  titulo: string
  descripcion: string
  children?: React.ReactNode
}

export function EstadoVacio({ icon: Icon, titulo, descripcion, children }: EstadoVacioProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary/15">
        <Icon className="size-6" aria-hidden />
      </div>
      <h3 className="mt-4 text-base font-semibold">{titulo}</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{descripcion}</p>
      {children}
    </div>
  )
}
