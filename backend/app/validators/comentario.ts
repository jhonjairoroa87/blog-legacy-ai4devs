import vine from '@vinejs/vine'
import type { ErrorReporterContract, FieldContext } from '@vinejs/vine/types'
import ComentarioException, { EntradaComentarioInvalida } from '#exceptions/comentario_exception'

/**
 * Reglas que reproducen las comprobaciones de hoy tal cual: `!valor` y `String(valor)`.
 * Por eso los campos son `vine.any()`: hoy se acepta cualquier valor «verdadero», también
 * números, y cambiarlo sería cambiar el contrato.
 */
const verdadero = vine.createRule((valor, _opciones, campo) => {
  if (!valor) {
    campo.report('El campo es obligatorio', 'verdadero', campo)
  }
})

const contieneArroba = vine.createRule((valor, _opciones, campo) => {
  if (String(valor).indexOf('@') === -1) {
    campo.report('El correo no es válido', 'arroba', campo)
  }
})

const longitudMinima = vine.createRule<{ min: number }>((valor, { min }, campo) => {
  if (String(valor).length < min) {
    campo.report('El texto es demasiado corto', 'longitudMinima', campo)
  }
})

type ErrorDeCampo = { campo: string; regla: string }

/**
 * Base de los reporters de comentarios: recoge los fallos y deja que cada validador
 * decida qué ComentarioException corresponde, en el orden en que hoy se comprueban.
 */
abstract class ReporterDeComentario implements ErrorReporterContract {
  hasErrors = false
  errores: ErrorDeCampo[] = []

  report(_mensaje: string, regla: string, campo: FieldContext) {
    this.hasErrors = true
    this.errores.push({ campo: campo.wildCardPath, regla })
  }

  protected falla(campo: string, reglas?: string[]) {
    return this.errores.some(
      (error) => error.campo === campo && (!reglas || reglas.includes(error.regla))
    )
  }

  createError() {
    return new EntradaComentarioInvalida(this.errores, this.respuesta())
  }

  protected abstract respuesta(): ComentarioException
}

class ReporterCrearComentario extends ReporterDeComentario {
  protected respuesta() {
    if (this.falla('autor_nombre')) return ComentarioException.nombreObligatorio()
    if (this.falla('autor_email', ['required', 'verdadero'])) {
      return ComentarioException.faltaEmail()
    }
    if (this.falla('autor_email')) return ComentarioException.emailNoValido()
    return ComentarioException.cuerpoDemasiadoCorto()
  }
}

class ReporterEditarComentario extends ReporterDeComentario {
  protected respuesta() {
    return ComentarioException.faltaCuerpo()
  }
}

/**
 * Entrada de POST /posts/:slug/comentarios.
 */
export const crearComentarioValidator = vine.create({
  autor_nombre: vine.any().use(verdadero()),
  autor_email: vine.any().use(verdadero()).use(contieneArroba()),
  cuerpo: vine
    .any()
    .use(verdadero())
    .use(longitudMinima({ min: 5 })),
  padre_id: vine.any().nullable().optional(),
})
crearComentarioValidator.errorReporter = () => new ReporterCrearComentario()

/**
 * Credenciales con las que se borra o se edita un comentario: el id de la ruta, el correo
 * de quien lo escribió y la cabecera de moderación. No fallan nunca: la decisión es del servicio.
 */
export const credencialesComentarioValidator = vine.create({
  params: vine.object({ id: vine.any() }),
  headers: vine.object({ 'x-clave-moderacion': vine.any().optional() }),
  autor_email: vine.any().nullable().optional(),
})

/**
 * Cuerpo nuevo de PATCH /comentarios/:id. Se valida DESPUÉS de autorizar, como hoy.
 * BUG (H16): no exige longitud mínima.
 */
export const editarComentarioValidator = vine.create({
  cuerpo: vine.any().use(verdadero()),
})
editarComentarioValidator.errorReporter = () => new ReporterEditarComentario()
