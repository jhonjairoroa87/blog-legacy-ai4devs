import { BaseTransformer } from '@adonisjs/core/transformers'
import type Comentario from '#models/comentario'

/**
 * Forma pública de un comentario: la misma fila que devolvía el `select *` de antes,
 * con los mismos nombres de columna.
 *
 * BUG (H13): incluye `autor_email` y `estado`. Se conserva para no cambiar el contrato;
 * quitarlos es otra tarea (contención H1 en docs/auditoria/comentarios.md).
 */
export default class ComentarioTransformer extends BaseTransformer<Comentario> {
  toObject() {
    const comentario = this.resource
    return {
      id: comentario.id,
      post_id: comentario.postId,
      autor_nombre: comentario.autorNombre,
      autor_email: comentario.autorEmail,
      cuerpo: comentario.cuerpo,
      estado: comentario.estado,
      creado_en: comentario.creadoEn ? comentario.creadoEn.toFormat('yyyy-MM-dd HH:mm:ss') : null,
      padre_id: comentario.padreId,
    }
  }
}
