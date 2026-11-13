# Plantillas de Supabase Auth

Generadas con `npm run correos:plantillas` y aplicadas con `npm run correos:sincronizar -- --aplicar`. **No editar a mano ni en el panel de Supabase:** se editan en `src/lib/correos/auth.ts` y `src/lib/correos/diseno.ts`.

| Plantilla del panel | Archivo | Asunto | Uso |
|---|---|---|---|
| Invite user | `invitacion.html` | `{{ if .Data.invitacion_admin }}Invitación al equipo administrativo de {{ if .Data.invitacion_institucion }}{{ .Data.invitacion_institucion }}{{ else }}tu institución{{ end }} — Academix{{ else }}Has sido invitado como docente a {{ if .Data.invitacion_institucion }}{{ .Data.invitacion_institucion }}{{ else }}tu institución{{ end }} — Academix{{ end }}` | Invitaciones de docentes y de administradores (mismo flujo: /auth/activar → crear contraseña → panel). |
| Reset password | `recuperacion.html` | `Restablece tu contraseña de Academix` | «¿Olvidaste tu contraseña?» y docentes o administradores que no terminaron de activar su cuenta. |
| Confirm signup | `confirmacion.html` | `Confirma tu correo en Academix` | Solo si la confirmación de correo está ACTIVADA en Supabase (Academix no la exige como requisito nuevo). |
| Change email address | `cambio-correo.html` | `Confirma el cambio de correo de tu cuenta de Academix` | Cambio de correo (la app no lo ofrece hoy; se deja en español por seguridad). |
