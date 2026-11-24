import { BaseTransformer } from '@adonisjs/core/transformers'

type ComentarioBorrado = { borrado: boolean }

/**
 * Respuesta de DELETE /comentarios/:id.
 */
export default class ComentarioBorradoTransformer extends BaseTransformer<ComentarioBorrado> {
  toObject() {
    return this.pick(this.resource, ['borrado'])
  }
}
