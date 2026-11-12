import { redirect } from "next/navigation"

/** Las reservas anteriores al pago completo se consultan en «Mis solicitudes». */
export default function MisReservasPage() {
  redirect("/estudiante/solicitudes")
}
