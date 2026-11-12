import { redirect } from "next/navigation"

/** Evaluaciones y notas están en una sola sección (menos pasos para el docente). */
export default function DocenteEvaluacionesPage() {
  redirect("/docente/calificaciones")
}
