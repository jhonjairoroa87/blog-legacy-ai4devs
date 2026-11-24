import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'

/**
 * Caracterización de los endpoints de comentarios.
 *
 * Fijan lo que el sistema hace HOY, bugs incluidos, para que el refactor a capas no cambie
 * ni un byte del contrato. Cada test marcado con «BUG (Hn)» documenta un defecto conocido de
 * docs/auditoria/comentarios.md: corregirlo es otra tarea, con su propio test.
 */

const CAMPOS_COMENTARIO = [
  'autor_email',
  'autor_nombre',
  'creado_en',
  'cuerpo',
  'estado',
  'id',
  'padre_id',
  'post_id',
]

const FECHA_SQL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

const CLAVE_MODERACION = 'dev-secret-cambiar'

function unPost(cambios: Record<string, unknown> = {}) {
  return {
    id: 9001,
    titulo: 'Post de prueba',
    slug: 'post-de-prueba',
    resumen: 'Resumen de prueba',
    cuerpo: '## Cuerpo de prueba',
    imagen_portada: null,
    estado: 'publicado',
    publicado_en: '2026-01-01 10:00:00',
    autor_id: 1,
    categoria_id: 1,
    autor_nombre: 'Marta Ruiz Calvo',
    autor_email: 'marta.ruiz@corriente.es',
    categoria_nombre: 'Noticias',
    etiquetas: 'Artículos',
    created_at: '2026-01-01 10:00:00',
    updated_at: '2026-01-01 10:00:00',
    ...cambios,
  }
}

function unComentario(cambios: Record<string, unknown> = {}) {
  return {
    id: 9101,
    post_id: 9001,
    autor_nombre: 'Lucía Ferrer',
    autor_email: 'lucia.ferrer@ejemplo.es',
    cuerpo: 'Un comentario de prueba.',
    estado: 'pendiente',
    creado_en: '2026-01-02 09:00:00',
    padre_id: null,
    ...cambios,
  }
}

function unEnvio(cambios: Record<string, unknown> = {}) {
  return {
    autor_nombre: 'Lucía Ferrer',
    autor_email: 'lucia.ferrer@ejemplo.es',
    cuerpo: 'Un comentario suficientemente largo.',
    ...cambios,
  }
}

async function comentariosDelPost(postId: number) {
  return db.from('comentarios').where('post_id', postId)
}

async function comentarioPorId(id: number) {
  return db.from('comentarios').where('id', id).first()
}

async function cuerpoGuardado(id: number) {
  const fila = await comentarioPorId(id)
  return fila.cuerpo
}

test.group('POST /posts/:slug/comentarios — caracterización', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('crea un comentario pendiente y devuelve la fila completa', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client.post('/posts/post-de-prueba/comentarios').json(unEnvio())

    // Assert
    respuesta.assertStatus(201)
    const cuerpo = respuesta.body()
    assert.deepEqual(Object.keys(cuerpo), ['comentario'])
    const comentario = cuerpo.comentario
    assert.sameMembers(Object.keys(comentario), CAMPOS_COMENTARIO)
    assert.isNumber(comentario.id)
    assert.strictEqual(comentario.post_id, 9001)
    assert.strictEqual(comentario.autor_nombre, 'Lucía Ferrer')
    assert.strictEqual(comentario.cuerpo, 'Un comentario suficientemente largo.')
    assert.strictEqual(comentario.estado, 'pendiente')
    assert.isNull(comentario.padre_id)
    assert.match(comentario.creado_en, FECHA_SQL)
    // BUG (H13): la respuesta es la fila cruda y devuelve el correo de quien comenta.
    assert.strictEqual(comentario.autor_email, 'lucia.ferrer@ejemplo.es')

    const guardado = await comentarioPorId(comentario.id)
    assert.strictEqual(guardado.estado, 'pendiente')
    assert.strictEqual(guardado.post_id, 9001)
  })

  test('acepta un cuerpo de exactamente 5 caracteres', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ cuerpo: 'Hola!' }))

    // Assert
    respuesta.assertStatus(201)
    assert.strictEqual(respuesta.body().comentario.cuerpo, 'Hola!')
  })

  test('BUG (H9): guarda padre_id aunque el comentario padre no exista', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ padre_id: 99999 }))

    // Assert
    respuesta.assertStatus(201)
    assert.strictEqual(respuesta.body().comentario.padre_id, 99999)
  })

  test('acepta números si son verdaderos y los devuelve como texto con decimal', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_nombre: 123, cuerpo: 12345 }))

    // Assert
    // better-sqlite3 envía el número como REAL y la columna de texto lo guarda como '123.0'.
    respuesta.assertStatus(201)
    assert.strictEqual(respuesta.body().comentario.autor_nombre, '123.0')
    assert.strictEqual(respuesta.body().comentario.cuerpo, '12345.0')
  })

  test('BUG (H15): cuerpo de 4 caracteres devuelve 200 con ok:false y no guarda nada', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ cuerpo: 'Hola' }))

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { ok: false, motivo: 'comentario demasiado corto' })
    assert.lengthOf(await comentariosDelPost(9001), 0)
  })

  test('sin cuerpo devuelve 200 con ok:false', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ cuerpo: undefined }))

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { ok: false, motivo: 'comentario demasiado corto' })
    assert.lengthOf(await comentariosDelPost(9001), 0)
  })

  test('sin nombre devuelve 400 con error', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_nombre: undefined }))

    // Assert
    respuesta.assertStatus(400)
    assert.deepEqual(respuesta.body(), { error: 'El nombre es obligatorio' })
    assert.lengthOf(await comentariosDelPost(9001), 0)
  })

  test('nombre vacío devuelve 400 con error', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_nombre: '' }))

    // Assert
    respuesta.assertStatus(400)
    assert.deepEqual(respuesta.body(), { error: 'El nombre es obligatorio' })
  })

  test('nombre falso pero no nulo (0) devuelve 400 con error', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_nombre: 0 }))

    // Assert
    respuesta.assertStatus(400)
    assert.deepEqual(respuesta.body(), { error: 'El nombre es obligatorio' })
    assert.lengthOf(await comentariosDelPost(9001), 0)
  })

  test('BUG (H15): sin correo devuelve 422 con message', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_email: undefined }))

    // Assert
    respuesta.assertStatus(422)
    assert.deepEqual(respuesta.body(), { message: 'Falta el email' })
    assert.lengthOf(await comentariosDelPost(9001), 0)
  })

  test('BUG (H15): correo sin arroba devuelve 400 con errores', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_email: 'lucia.ferrer' }))

    // Assert
    respuesta.assertStatus(400)
    assert.deepEqual(respuesta.body(), { errores: ['email no válido'] })
    assert.lengthOf(await comentariosDelPost(9001), 0)
  })

  test('sin nombre ni correo gana el error del nombre', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json({ cuerpo: 'Hola' })

    // Assert
    respuesta.assertStatus(400)
    assert.deepEqual(respuesta.body(), { error: 'El nombre es obligatorio' })
  })

  test('correo sin arroba y cuerpo corto: gana el error del correo', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_email: 'sin-arroba', cuerpo: 'Hola' }))

    // Assert
    respuesta.assertStatus(400)
    assert.deepEqual(respuesta.body(), { errores: ['email no válido'] })
  })

  test('post inexistente devuelve 404', async ({ client, assert }) => {
    // Act
    const respuesta = await client.post('/posts/no-existe/comentarios').json(unEnvio())

    // Assert
    respuesta.assertStatus(404)
    assert.deepEqual(respuesta.body(), { error: 'Post no encontrado' })
  })

  test('post inexistente con entrada inválida: el 404 va antes que la validación', async ({
    client,
    assert,
  }) => {
    // Act
    const respuesta = await client.post('/posts/no-existe/comentarios').json({})

    // Assert
    respuesta.assertStatus(404)
    assert.deepEqual(respuesta.body(), { error: 'Post no encontrado' })
  })

  test('un post en borrador no admite comentarios (404)', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost({ estado: 'borrador' }))

    // Act
    const respuesta = await client.post('/posts/post-de-prueba/comentarios').json(unEnvio())

    // Assert
    respuesta.assertStatus(404)
    assert.deepEqual(respuesta.body(), { error: 'Post no encontrado' })
    assert.lengthOf(await comentariosDelPost(9001), 0)
  })
})

test.group('DELETE /comentarios/:id — caracterización', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('borra el comentario con el correo exacto de quien lo escribió', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es' })

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { borrado: true })
    assert.isNull(await comentarioPorId(9101))
  })

  test('BUG (H2): borra un comentario aprobado con solo el correo', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario({ estado: 'aprobado' }))

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es' })

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { borrado: true })
    assert.isNull(await comentarioPorId(9101))
  })

  test('acepta el correo con otras mayúsculas y espacios', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .json({ autor_email: '  LUCIA.Ferrer@Ejemplo.ES ' })

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { borrado: true })
  })

  test('acepta el correo por query string', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .qs({ autor_email: 'lucia.ferrer@ejemplo.es' })

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { borrado: true })
  })

  test('BUG (H3): la clave de moderación escrita en el código borra sin correo', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .header('x-clave-moderacion', CLAVE_MODERACION)

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { borrado: true })
    assert.isNull(await comentarioPorId(9101))
  })

  test('correo ajeno devuelve 403 y no borra', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .json({ autor_email: 'otra.persona@ejemplo.es' })

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes borrar este comentario' })
    assert.isNotNull(await comentarioPorId(9101))
  })

  test('sin correo ni clave devuelve 403', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client.delete('/comentarios/9101')

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes borrar este comentario' })
    assert.isNotNull(await comentarioPorId(9101))
  })

  test('clave de moderación incorrecta devuelve 403', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .header('x-clave-moderacion', 'otra-clave')

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes borrar este comentario' })
  })

  test('comentario inexistente devuelve 404', async ({ client, assert }) => {
    // Act
    const respuesta = await client
      .delete('/comentarios/999999')
      .header('x-clave-moderacion', CLAVE_MODERACION)

    // Assert
    respuesta.assertStatus(404)
    assert.deepEqual(respuesta.body(), { error: 'Comentario no encontrado' })
  })

  test('borra comentarios de un post en borrador (no mira el post)', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost({ estado: 'borrador' }))
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es' })

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { borrado: true })
  })

  test('BUG (H11): borrar un padre deja sus respuestas en la tabla', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())
    await db
      .table('comentarios')
      .insert(unComentario({ id: 9102, padre_id: 9101, autor_email: 'otra@ejemplo.es' }))

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es' })

    // Assert
    respuesta.assertStatus(200)
    const respuestaHuerfana = await comentarioPorId(9102)
    assert.isNotNull(respuestaHuerfana)
    assert.strictEqual(respuestaHuerfana.padre_id, 9101)
  })
})

test.group('PATCH /comentarios/:id — caracterización', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('edita el cuerpo de un comentario pendiente y devuelve la fila completa', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es', cuerpo: 'Texto corregido.' })

    // Assert
    respuesta.assertStatus(200)
    const cuerpo = respuesta.body()
    assert.deepEqual(Object.keys(cuerpo), ['comentario'])
    // BUG (H13): la respuesta es la fila cruda, con correo y estado.
    assert.deepEqual(cuerpo.comentario, {
      id: 9101,
      post_id: 9001,
      autor_nombre: 'Lucía Ferrer',
      autor_email: 'lucia.ferrer@ejemplo.es',
      cuerpo: 'Texto corregido.',
      estado: 'pendiente',
      creado_en: '2026-01-02 09:00:00',
      padre_id: null,
    })
    assert.strictEqual(await cuerpoGuardado(9101), 'Texto corregido.')
  })

  test('BUG (H16): acepta un cuerpo de 1 carácter', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es', cuerpo: 'a' })

    // Assert
    respuesta.assertStatus(200)
    assert.strictEqual(respuesta.body().comentario.cuerpo, 'a')
  })

  test('sin cuerpo devuelve 400 y no cambia nada', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es' })

    // Assert
    respuesta.assertStatus(400)
    assert.deepEqual(respuesta.body(), { error: 'Falta el cuerpo' })
    assert.strictEqual(await cuerpoGuardado(9101), 'Un comentario de prueba.')
  })

  test('BUG (H14): el correo con otras mayúsculas no sirve para editar (403)', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .json({ autor_email: 'LUCIA.FERRER@ejemplo.es', cuerpo: 'Texto corregido.' })

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes editar este comentario' })
    assert.strictEqual(await cuerpoGuardado(9101), 'Un comentario de prueba.')
  })

  test('BUG (H14): la clave de moderación no sirve para editar (403)', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .header('x-clave-moderacion', CLAVE_MODERACION)
      .json({ cuerpo: 'Texto corregido.' })

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes editar este comentario' })
  })

  test('un comentario aprobado no se puede editar (403)', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario({ estado: 'aprobado' }))

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es', cuerpo: 'Texto corregido.' })

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes editar este comentario' })
    assert.strictEqual(await cuerpoGuardado(9101), 'Un comentario de prueba.')
  })

  test('correo ajeno y sin cuerpo: la autorización va antes que la validación', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .json({ autor_email: 'otra.persona@ejemplo.es' })

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes editar este comentario' })
  })

  test('comentario inexistente devuelve 404', async ({ client, assert }) => {
    // Act
    const respuesta = await client
      .patch('/comentarios/999999')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es', cuerpo: 'Texto corregido.' })

    // Assert
    respuesta.assertStatus(404)
    assert.deepEqual(respuesta.body(), { error: 'Comentario no encontrado' })
  })

  test('BUG (H23): un creado_en nulo sale como null en la respuesta', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario({ creado_en: null }))

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es', cuerpo: 'Texto corregido.' })

    // Assert
    respuesta.assertStatus(200)
    assert.isNull(respuesta.body().comentario.creado_en)
  })
})
