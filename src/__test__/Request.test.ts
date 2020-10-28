import request, { send, isRetryable } from '../Request'
import { UploadErrorCode } from '../UploadError'
import http from 'http'
import { AddressInfo } from 'net'
import multiparty from 'multiparty'

let server: http.Server
afterEach(() => server?.close())

test('request: isRetryable()', () => {
  expect(isRetryable(undefined)).toBe(true)
  expect(isRetryable(100)).toBe(true)
  expect(isRetryable(400)).toBe(false)
  expect(isRetryable(404)).toBe(false)
  expect(isRetryable(408)).toBe(true)
  expect(isRetryable(429)).toBe(true)
  expect(isRetryable(500)).toBe(true)
})

test('request: send() successful upload', async () => {
  const received: {
    fields: Record<string, string[]>
    files: Record<string, multiparty.File[]>
  }[] = []
  server = http.createServer(async (req, res) => {
    await new Promise((resolve) => {
      const form = new multiparty.Form()
      form.parse(req, function(err, fields, files) {
        received.push({ fields, files })
        res.end('OK')
        resolve()
      });
    })
  })

  await new Promise((resolve) => server.listen(() => resolve()))

  const port = (server.address() as AddressInfo).port

  await send(`http://localhost:${port}`, {
    apiKey: '123',
    minifiedUrl: 'http://example.url',
    sourceMap: { filepath: 'dist/app.js.map', data: '{}' },
    minifiedFile: { filepath: 'dist/app.js', data: 'console.log("hello")' }
  }, {})

  expect(received.length).toBe(1)

  expect(received[0].fields.apiKey[0]).toBe('123')

  expect(received[0].fields.minifiedUrl[0]).toBe('http://example.url')

  expect(received[0].files.sourceMap[0].originalFilename).toBe('dist/app.js.map')
  expect(received[0].files.sourceMap[0].headers['content-type']).toBe('application/json')

  expect(received[0].files.minifiedFile[0].originalFilename).toBe('dist/app.js')
  expect(received[0].files.minifiedFile[0].headers['content-type']).toBe('application/javascript')
})

test('request: send() successful upload (with overwrite, appVersion)', async () => {
  const received: {
    fields: Record<string, string[]>
    files: Record<string, multiparty.File[]>
  }[] = []
  server = http.createServer(async (req, res) => {
    await new Promise((resolve) => {
      const form = new multiparty.Form()
      form.parse(req, function(err, fields, files) {
        received.push({ fields, files })
        res.end('OK')
        resolve()
      });
    })
  })

  await new Promise((resolve) => server.listen(() => resolve()))

  const port = (server.address() as AddressInfo).port

  await send(`http://localhost:${port}`, {
    apiKey: '123',
    appVersion: '1.2.3',
    minifiedUrl: 'http://example.url',
    sourceMap: { filepath: 'dist/app.js.map', data: '{}' },
    overwrite: true
  }, {})

  expect(received.length).toBe(1)

  expect(received[0].fields.apiKey[0]).toBe('123')

  expect(received[0].fields.appVersion[0]).toBe('1.2.3')

  expect(received[0].fields.overwrite[0]).toBe('true')

  expect(received[0].fields.minifiedUrl[0]).toBe('http://example.url')

  expect(received[0].files.sourceMap[0].originalFilename).toBe('dist/app.js.map')
  expect(received[0].files.sourceMap[0].headers['content-type']).toBe('application/json')
})

test('request: send() unsuccessful upload (invalid, no retry)', async () => {
  server = http.createServer(async (req, res) => {
    res.statusCode = 400
    res.end('invalid')
  })

  await new Promise((resolve) => server.listen(() => resolve()))

  const port = (server.address() as AddressInfo).port

  try {
    await send(`http://localhost:${port}`, {
      apiKey: '123',
      minifiedUrl: 'http://example.url',
      sourceMap: { filepath: 'dist/app.js.map', data: '{}' },
      minifiedFile: { filepath: 'dist/app.js', data: 'console.log("hello")' }
    }, {})
  } catch (e) {
    expect(e.isRetryable).toBe(false)
    expect(e.code).toBe(UploadErrorCode.MISC_BAD_REQUEST)
  }
})

test('request: send() unsuccessful upload (invalid, empty file)', async () => {
  server = http.createServer(async (req, res) => {
    res.statusCode = 422
    res.end('empty file')
  })

  await new Promise((resolve) => server.listen(() => resolve()))

  const port = (server.address() as AddressInfo).port

  try {
    await send(`http://localhost:${port}`, {
      apiKey: '123',
      minifiedUrl: 'http://example.url',
      sourceMap: { filepath: 'dist/app.js.map', data: '{}' },
      minifiedFile: { filepath: 'dist/app.js', data: 'console.log("hello")' }
    }, {})
  } catch (e) {
    expect(e.isRetryable).toBe(false)
    expect(e.code).toBe(UploadErrorCode.EMPTY_FILE)
  }
})

test('request: send() unsuccessful upload (misc 40x code)', async () => {
  server = http.createServer(async (req, res) => {
    res.statusCode = 404
    res.end('not found')
  })

  await new Promise((resolve) => server.listen(() => resolve()))

  const port = (server.address() as AddressInfo).port

  try {
    await send(`http://localhost:${port}`, {
      apiKey: '123',
      minifiedUrl: 'http://example.url',
      sourceMap: { filepath: 'dist/app.js.map', data: '{}' },
      minifiedFile: { filepath: 'dist/app.js', data: 'console.log("hello")' }
    }, {})
  } catch (e) {
    expect(e.isRetryable).toBe(false)
    expect(e.code).toBe(UploadErrorCode.MISC_BAD_REQUEST)
  }
})

test('request: send() unsuccessful upload (unauthed, no retry)', async () => {
  server = http.createServer(async (req, res) => {
    res.statusCode = 401
    res.end('unauthenticated')
  })

  await new Promise((resolve) => server.listen(() => resolve()))

  const port = (server.address() as AddressInfo).port

  try {
    await send(`http://localhost:${port}`, {
      apiKey: '123',
      minifiedUrl: 'http://example.url',
      sourceMap: { filepath: 'dist/app.js.map', data: '{}' },
      minifiedFile: { filepath: 'dist/app.js', data: 'console.log("hello")' }
    }, {})
  } catch (e) {
    expect(e.isRetryable).toBe(false)
    expect(e.code).toBe(UploadErrorCode.INVALID_API_KEY)
  }
})

test('request: send() unsuccessful upload (retryable status)', async () => {
  server = http.createServer(async (req, res) => {
    res.statusCode = 500
    res.end('server error')
  })

  await new Promise((resolve) => server.listen(() => resolve()))

  const port = (server.address() as AddressInfo).port

  try {
    await send(`http://localhost:${port}`, {
      apiKey: '123',
      minifiedUrl: 'http://example.url',
      sourceMap: { filepath: 'dist/app.js.map', data: '{}' },
      minifiedFile: { filepath: 'dist/app.js', data: 'console.log("hello")' }
    }, {})
  } catch (e) {
    expect(e.isRetryable).toBe(true)
    expect(e.code).toBe(UploadErrorCode.SERVER_ERROR)
    expect(e.responseText).toBe('server error')
  }
})

test('request: send() unsuccessful upload (timeout)', async () => {
  server = http.createServer(async () => {
    // intentionally hang
  })

  await new Promise((resolve) => server.listen(() => resolve()))

  const port = (server.address() as AddressInfo).port

  try {
    await send(`http://localhost:${port}`, {
      apiKey: '123',
      minifiedUrl: 'http://example.url',
      sourceMap: { filepath: 'dist/app.js.map', data: '{}' },
      minifiedFile: { filepath: 'dist/app.js', data: 'console.log("hello")' }
    }, {})
  } catch (e) {
    expect(e.isRetryable).toBe(true)
    expect(e.code).toBe(UploadErrorCode.TIMEOUT)
  }
})

test('request: send() unsuccessful upload (duplicate)', async () => {
  server = http.createServer(async (req, res) => {
    res.statusCode = 409
    res.end('duplicate')
  })

  await new Promise((resolve) => server.listen(() => resolve()))

  const port = (server.address() as AddressInfo).port

  try {
    await send(`http://localhost:${port}`, {
      apiKey: '123',
      minifiedUrl: 'http://example.url',
      sourceMap: { filepath: 'dist/app.js.map', data: '{}' },
      minifiedFile: { filepath: 'dist/app.js', data: 'console.log("hello")' }
    }, {})
  } catch (e) {
    expect(e.isRetryable).toBe(false)
    expect(e.code).toBe(UploadErrorCode.DUPLICATE)
  }
})

test('request: request() multiple attempts at retryable errors', async () => {
  let requestsReceived = 0
  server = http.createServer(async () => {
    // intentionally hang
    requestsReceived += 1
  })

  await new Promise((resolve) => server.listen(() => resolve()))

  const port = (server.address() as AddressInfo).port

  try {
    await request(`http://localhost:${port}`, {
      apiKey: '123',
      minifiedUrl: 'http://example.url',
      sourceMap: { filepath: 'dist/app.js.map', data: '{}' },
      minifiedFile: { filepath: 'dist/app.js', data: 'console.log("hello")' }
    }, {})
  } catch (e) {
    expect(requestsReceived).toBe(5)
    expect(e.code).toBe(UploadErrorCode.TIMEOUT)
  }
})

test('request: request() multiple attempts, eventually succeeds', async () => {
  let requestsReceived = 0
  server = http.createServer(async (req, res) => {
    // intentionally hang
    requestsReceived += 1
    if (requestsReceived > 3) res.end('OK')
  })

  await new Promise((resolve) => server.listen(() => resolve()))

  const port = (server.address() as AddressInfo).port
  await request(`http://localhost:${port}`, {
    apiKey: '123',
    minifiedUrl: 'http://example.url',
    sourceMap: { filepath: 'dist/app.js.map', data: '{}' },
    minifiedFile: { filepath: 'dist/app.js', data: 'console.log("hello")' }
  }, {})

  expect(requestsReceived).toBe(4)
})