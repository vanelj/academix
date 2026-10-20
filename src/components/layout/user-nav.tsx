"use client"

import { useTransition } from "react"
import Link from "next/link"
import { Loader2, LogOut, Repeat, UserRound } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { useNavegacionProtegida } from "@/components/layout/proteccion-cambios"
import { roleConfig } from "@/config/navigation"
import type { ShellUser } from "@/config/demo-user"
import { cerrarSesion } from "@/lib/auth/acciones"

/**
 * Inicial del avatar: primera letra del nombre del perfil; si no hay nombre,
 * la del correo. La tabla perfiles (V5) no tiene columna de fotografía, por eso
 * no se muestra imagen.
 */
function inicial(user: ShellUser): string {
  const fuente = user.name.trim() || user.email.trim()
  return fuente ? fuente[0].toLocaleUpperCase("es") : "?"
}

export function UserNav({ user }: { user: ShellUser }) {
  const [saliendo, startTransition] = useTransition()
  const proteger = useNavegacionProtegida()
  const rol = roleConfig[user.role]
  const multirrol = (user.roles?.length ?? 0) > 1
  const nombre = user.name.trim() || user.email

  return (
    <div className="flex items-center gap-3">
      <div className="hidden min-w-0 text-right leading-tight md:block">
        <p className="max-w-48 truncate text-sm font-medium">{nombre}</p>
        <p className="text-xs text-muted-foreground">{rol.label}</p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`Menú de usuario: ${nombre}, ${rol.label}`}
        >
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary dark:bg-primary/20">
              {inicial(user)}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={8} className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-3 py-2">
              <Avatar className="size-10">
                <AvatarFallback className="bg-primary/10 font-semibold text-primary dark:bg-primary/20">
                  {inicial(user)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-medium text-foreground">{nombre}</span>
                {user.email && (
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {user.email}
                  </span>
                )}
                <Badge variant="secondary" className="mt-1.5">
                  {rol.label}
                </Badge>
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href={`${rol.basePath}/perfil`} onNavigate={proteger(`${rol.basePath}/perfil`)} />}>
              <UserRound aria-hidden />
              Mi perfil
            </DropdownMenuItem>
            {multirrol && (
              <DropdownMenuItem render={<Link href="/seleccionar-rol" onNavigate={proteger("/seleccionar-rol")} />}>
                <Repeat aria-hidden />
                Cambiar rol
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            disabled={saliendo}
            closeOnClick={false}
            onClick={() => startTransition(() => cerrarSesion())}
          >
            {saliendo ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
            {saliendo ? "Cerrando sesión…" : "Cerrar sesión"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
