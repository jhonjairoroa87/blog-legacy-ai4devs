import { inject } from '@adonisjs/core'
import { DateTime } from 'luxon'
import type Comentario from '#models/comentario'
import type Post from '#models/post'
import ComentarioException from '#exceptions/comentario_exception'
import ComentarioRepository from '#repositories/comentario_repository'
import PostRepository from '#repositories/post_repository'

/**
 * BUG (H3): la clave de moderación está escrita en el código. Se conserva tal cual;
 * moverla a variables de entorno y rotarla es otra tarea.
 */
const CLAVE_MODERACION = 'dev-secret-cambiar'

type NuevoComentario = {
  autor_nombre?: unknown
  autor_email?: unknown
  cuerpo?: unknown
  padre_id?: unknown
}

type Credenciales = {
  email: unknown
  clave: unknown
}

/**
 * Reglas de negocio de los comentarios. Es el único sitio que muta estado.
 */
@inject()
export class ComentarioService {
  constructor(
    protected comentarios: ComentarioRepository,
    protected posts: PostRepository
  ) {}

  async postPublicadoOFallar(slug: string) {
    const post = await this.posts.buscarPublicadoPorSlug(slug)
    if (!post) {
      throw ComentarioException.postNoEncontrado()
    }
    return post
  }

  /**
   * Crea el comentario como pendiente de moderación.
   * BUG (H9): padre_id se guarda sin comprobar que exista ni que sea del mismo post.
   */
  async crear(post: Post, datos: NuevoComentario) {
    await this.comentarios.crear({
      postId: post.id,
      autorNombre: datos.autor_nombre as string,
      autorEmail: datos.autor_email as string,
      cuerpo: datos.cuerpo as string,
      estado: 'pendiente',
      creadoEn: DateTime.utc(),
      padreId: (datos.padre_id ?? null) as number | null,
    })
    return this.comentarios.conIdMasAlto()
  }

  /**
   * Puede borrar quien lo escribió (correo sin distinguir mayúsculas ni espacios) o quien
   * traiga la clave de moderación.
   * BUG (H2): el correo, que además sale en la respuesta pública, basta como credencial.
   * BUG (H11): borrar un padre deja sus respuestas huérfanas.
   */
  async borrar(id: unknown, credenciales: Credenciales) {
    const comentario = await this.encontrarOFallar(id)
    const email = credenciales.email === undefined ? '' : credenciales.email
    const esModerador = credenciales.clave === CLAVE_MODERACION
    const esAutor =
      String(comentario.autorEmail).toLowerCase().trim() === String(email).toLowerCase().trim()

    if (!esModerador && !esAutor) {
      throw ComentarioException.noPuedesBorrar()
    }
    await this.comentarios.borrar(comentario)
  }

  /**
   * BUG (H14): la regla de editar es distinta a la de borrar: compara el correo exacto,
   * no admite la clave de moderación y exige que el comentario siga pendiente.
   */
  async editableOFallar(id: unknown, emailRecibido: unknown) {
    const comentario = await this.encontrarOFallar(id)
    const email = emailRecibido === undefined ? '' : emailRecibido
    if (comentario.autorEmail !== email || comentario.estado !== 'pendiente') {
      throw ComentarioException.noPuedesEditar()
    }
    return comentario
  }

  async editar(comentario: Comentario, cuerpo: unknown) {
    await this.comentarios.actualizarCuerpo(comentario, cuerpo)
    return this.comentarios.buscarPorId(comentario.id)
  }

  protected async encontrarOFallar(id: unknown) {
    const comentario = await this.comentarios.buscarPorId(id)
    if (!comentario) {
      throw ComentarioException.comentarioNoEncontrado()
    }
    return comentario
  }
}
