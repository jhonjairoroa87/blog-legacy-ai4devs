import Comentario from '#models/comentario'

/**
 * Todo el acceso a datos de la tabla `comentarios`.
 */
export default class ComentarioRepository {
  crear(datos: Partial<Comentario>) {
    return Comentario.create(datos)
  }

  /**
   * BUG (H4): el endpoint de crear devuelve el comentario con el id más alto de la tabla,
   * no el que acaba de insertar. Con dos envíos simultáneos, uno recibe la fila del otro.
   */
  conIdMasAlto() {
    return Comentario.query().orderBy('id', 'desc').first()
  }

  buscarPorId(id: unknown) {
    return Comentario.find(id)
  }

  async borrar(comentario: Comentario) {
    await comentario.delete()
  }

  async actualizarCuerpo(comentario: Comentario, cuerpo: unknown) {
    comentario.cuerpo = cuerpo as string
    await comentario.save()
  }
}
