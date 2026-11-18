const assert = require('node:assert/strict')
const {spawn} = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const {test} = require('node:test')

const projectRoot = path.join(__dirname, '..')
const serverPath = path.join(projectRoot, 'server.js')

test('importing server.js does not open a port', () => {
  const {server, listen} = require('../server')
  assert.equal(server.listening, false)
  assert.equal(typeof listen, 'function')
})

test('node server.js listens on PORT', async () => {
  const child = spawn(process.execPath, [serverPath], {
    cwd: projectRoot,
    env: {...process.env, PORT: '0'},
  })
  try {
    const port = await readPort(child)
    const home = await fetch(`http://127.0.0.1:${port}/`)
    assert.ok(home.status === 200 || home.status === 500)
    if (fs.existsSync(path.join(projectRoot, 'web-build/site-routes.json'))) {
      assert.equal(home.status, 200)
      assert.match(home.headers.get('link') || '', /<\/llms\.txt>/)
      assert.equal(
        (await fetch(`http://127.0.0.1:${port}/robots.txt`)).status,
        200,
      )
    }
  } finally {
    child.kill()
  }
})

test('LiteSpeed lsnode require() listens even though this file is not main', async () => {
  const child = spawn(
    process.execPath,
    [
      '-e',
      `process.env.LSNODE_STARTUP_FILE='server.js';process.env.PORT='0';require(${JSON.stringify(serverPath)})`,
    ],
    {cwd: projectRoot, env: {...process.env, PORT: '0'}},
  )
  try {
    const port = await readPort(child)
    const robots = await fetch(`http://127.0.0.1:${port}/robots.txt`)
    assert.ok(robots.status === 200 || robots.status === 500)
  } finally {
    child.kill()
  }
})

test('lsnode fallback exports.listen accepts the socket', async () => {
  const child = spawn(
    process.execPath,
    [
      '-e',
      `
        const app = require(${JSON.stringify(serverPath)})
        if (app.server.listening) process.exit(2)
        app.listen(0, '127.0.0.1', () => {
          console.log('AQUASOCIAL web server listening on port ' + app.server.address().port)
        })
      `,
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        LSNODE_STARTUP_FILE: '',
        LSNODE_ROOT: '',
        PASSENGER_APP_ENV: '',
      },
    },
  )
  try {
    const port = await readPort(child)
    const home = await fetch(`http://127.0.0.1:${port}/`)
    assert.ok(home.status === 200 || home.status === 500)
  } finally {
    child.kill()
  }
})

function readPort(child) {
  return new Promise((resolve, reject) => {
    let output = ''
    let settled = false
    const finish = (error, port) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(port)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(new Error(`server did not listen\n${output}`))
    }, 5000)
    const onData = chunk => {
      output += chunk
      const match = output.match(/listening on port (\d+)/)
      if (match) finish(null, match[1])
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', code => {
      finish(new Error(`server exited ${code}\n${output}`))
    })
  })
}
