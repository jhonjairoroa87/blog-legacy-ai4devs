import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ComentarioService } from '#services/comentario_service'
import ComentarioTransformer from '#transformers/comentario_transformer'
import ComentarioBorradoTransformer from '#transformers/comentario_borrado_transformer'
import {
  crearComentarioValidator,
  credencialesComentarioValidator,
  editarComentarioValidator,
} from '#validators/comentario'

@inject()
export default class ComentariosController {
  constructor(protected servicio: ComentarioService) {}

  /**
   * POST /posts/:slug/comentarios — el post se busca ANTES de validar, como hoy:
   * un post inexistente da 404 aunque la entrada sea inválida.
   */
  async store({ params, request, response, serialize }: HttpContext) {
    const post = await this.servicio.postPublicadoOFallar(params.slug)
    const datos = await request.validateUsing(crearComentarioValidator)
    const comentario = await this.servicio.crear(post, datos)

    response.status(201)
    return serialize.withoutWrapping({ comentario: ComentarioTransformer.transform(comentario) })
  }

  /**
   * DELETE /comentarios/:id
   */
  async destroy({ request, serialize }: HttpContext) {
    const {
      params,
      headers,
      autor_email: autorEmail,
    } = await request.validateUsing(credencialesComentarioValidator)
    await this.servicio.borrar(params.id, {
      email: autorEmail,
      clave: headers['x-clave-moderacion'],
    })

    return serialize.withoutWrapping(ComentarioBorradoTransformer.transform({ borrado: true }))
  }

  /**
   * PATCH /comentarios/:id — se autoriza ANTES de validar el cuerpo, como hoy.
   */
  async update({ request, serialize }: HttpContext) {
    const { params, autor_email: autorEmail } = await request.validateUsing(
      credencialesComentarioValidator
    )
    const comentario = await this.servicio.editableOFallar(params.id, autorEmail)
    const { cuerpo } = await request.validateUsing(editarComentarioValidator)
    const editado = await this.servicio.editar(comentario, cuerpo)

    return serialize.withoutWrapping({ comentario: ComentarioTransformer.transform(editado) })
  }
}
