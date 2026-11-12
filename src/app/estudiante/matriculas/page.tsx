import { redirect } from "next/navigation"

/** Las matrículas confirmadas son «Mis cursos»: una sola sección. */
export default function MisMatriculasPage() {
  redirect("/estudiante/cursos")
}
