import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import ComentarioException, { EntradaComentarioInvalida } from '#exceptions/comentario_exception'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    /**
     * Errores de comentarios: se responden con el código y el cuerpo exactos del contrato.
     */
    const errorDeComentario = error instanceof EntradaComentarioInvalida ? error.respuesta : error
    if (errorDeComentario instanceof ComentarioException) {
      return ctx.response.status(errorDeComentario.status).send(errorDeComentario.cuerpo)
    }
    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    if (error instanceof ComentarioException || error instanceof EntradaComentarioInvalida) {
      return
    }
    return super.report(error, ctx)
  }
}
