import { Exception } from '@adonisjs/core/exceptions'
import { errors as erroresVine } from '@vinejs/vine'

/**
 * Errores de la feature de comentarios, con el código y el cuerpo EXACTOS que la API
 * devuelve hoy. Se pintan en un único sitio: `app/exceptions/handler.ts`.
 *
 * Las formas son incoherentes a propósito (400 / 422 / 200 con `error`, `message`, `errores`
 * o `motivo`): es el bug H15 de docs/auditoria/comentarios.md. El refactor las conserva;
 * unificarlas es otra tarea, con su propio test.
 */
export default class ComentarioException extends Exception {
  constructor(
    status: number,
    readonly cuerpo: Record<string, unknown>
  ) {
    super(JSON.stringify(cuerpo), { status })
  }

  static postNoEncontrado() {
    return new ComentarioException(404, { error: 'Post no encontrado' })
  }

  static comentarioNoEncontrado() {
    return new ComentarioException(404, { error: 'Comentario no encontrado' })
  }

  static noPuedesBorrar() {
    return new ComentarioException(403, { error: 'No puedes borrar este comentario' })
  }

  static noPuedesEditar() {
    return new ComentarioException(403, { error: 'No puedes editar este comentario' })
  }

  static nombreObligatorio() {
    return new ComentarioException(400, { error: 'El nombre es obligatorio' })
  }

  static faltaEmail() {
    return new ComentarioException(422, { message: 'Falta el email' })
  }

  static emailNoValido() {
    return new ComentarioException(400, { errores: ['email no válido'] })
  }

  /** BUG (H15): un cuerpo corto responde 200, no un error. */
  static cuerpoDemasiadoCorto() {
    return new ComentarioException(200, { ok: false, motivo: 'comentario demasiado corto' })
  }

  static faltaCuerpo() {
    return new ComentarioException(400, { error: 'Falta el cuerpo' })
  }
}

/**
 * Fallo de validación de una entrada de comentarios. VineJS exige que el reporter devuelva
 * un ValidationError; este lleva dentro la ComentarioException con la respuesta exacta.
 */
export class EntradaComentarioInvalida extends erroresVine.E_VALIDATION_ERROR {
  constructor(
    messages: unknown[],
    readonly respuesta: ComentarioException
  ) {
    super(messages)
  }
}
