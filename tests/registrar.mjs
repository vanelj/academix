// Registra el resolutor de rutas de Academix para las pruebas con node:test.
import { register } from "node:module"

register("./resolutor.mjs", import.meta.url)
