import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(scriptDirectory, '..');
const composeFile = path.join(repositoryDirectory, 'deploy', 'compose.yml');
const ignoredEnvironmentFile = path.join(repositoryDirectory, '.dockerignore');
const composeEnvironmentName = 'compose.env';
const ghnEnvironmentNames = ['GHN_API_KEY', 'GHN_SHOP_ID', 'GHN_SHOP_IDS'];

function createOperationalEnvironment() {
  const environment = {};
  for (const name of [
    'PATH',
    'Path',
    'SystemRoot',
    'WINDIR',
    'ComSpec',
    'PATHEXT',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'ProgramData',
    'USERDOMAIN',
    'USERNAME',
    'HOMEDRIVE',
    'HOMEPATH',
    'ALLUSERSPROFILE',
    'CommonProgramFiles',
    'CommonProgramFiles(x86)',
    'CommonProgramW6432',
    'COMPUTERNAME',
    'DriverData',
    'NUMBER_OF_PROCESSORS',
    'OS',
    'PROCESSOR_ARCHITECTURE',
    'PROCESSOR_IDENTIFIER',
    'PROCESSOR_LEVEL',
    'PROCESSOR_REVISION',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'ProgramW6432',
    'SystemDrive',
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_CONFIG',
  ]) {
    if (process.env[name]) {
      environment[name] = process.env[name];
    }
  }
  return environment;
}

function createComposeEnvironment({ includeGhn }) {
  const entries = [
    'POSTGRES_USER=synthetic-postgres-user',
    'POSTGRES_PASSWORD=synthetic-postgres-password',
    'POSTGRES_DB=synthetic-postgres-db',
    'APP_DATABASE_USER=synthetic-app-user',
    'APP_DATABASE_PASSWORD=synthetic-app-password',
    'PUBLIC_APP_URL=https://synthetic.example.test',
    'LOCAL_DATABASE_URL=postgresql://synthetic-app-user:synthetic-app-password@postgres:5432/synthetic-postgres-db',
    'LOCAL_ALLOWED_ORIGINS=https://synthetic.example.test',
    'APP_DOMAIN=synthetic.example.test',
    'ACME_EMAIL=synthetic@example.test',
  ];

  if (includeGhn) {
    entries.push(
      'GHN_API_KEY=synthetic-ghn-api-key',
      'GHN_SHOP_ID=123',
      'GHN_SHOP_IDS=123,456',
    );
  }

  return `${entries.join('\n')}\n`;
}

function getEnvironmentValue(service, name) {
  const environment = service.environment;
  if (Array.isArray(environment)) {
    const entry = environment.find((candidate) => candidate.startsWith(`${name}=`));
    return entry?.slice(name.length + 1);
  }
  return environment?.[name];
}

function containsGhnEnvironmentName(value) {
  return /\"GHN_(?:API_KEY|SHOP_ID|SHOP_IDS)\"/.test(JSON.stringify(value));
}

async function renderComposeConfig(temporaryDirectory, includeGhn) {
  const environmentFile = path.join(temporaryDirectory, composeEnvironmentName);
  await writeFile(environmentFile, createComposeEnvironment({ includeGhn }), 'utf8');

  let result;
  try {
    result = await execFileAsync(
      'docker',
      [
        'compose',
        '--project-directory', temporaryDirectory,
        '--env-file', environmentFile,
        '-f', composeFile,
        'config',
        '--format', 'json',
      ],
      {
        cwd: temporaryDirectory,
        env: createOperationalEnvironment(),
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );
  } catch {
    throw new Error('Docker Compose configuration check failed.');
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('Docker Compose returned an unreadable configuration.');
  }
}

function assertGhnConfiguration(rendered, expected) {
  const services = rendered.services;
  assert.ok(services?.api, 'The API service must be present.');
  assert.ok(services?.web, 'The web service must be present.');
  assert.ok(services?.postgres, 'The PostgreSQL service must be present.');

  for (const [name, value] of Object.entries(expected)) {
    assert.equal(getEnvironmentValue(services.api, name), value, `Unexpected ${name} value.`);
  }

  assert.equal(containsGhnEnvironmentName(services.web.environment), false, 'Web must not receive GHN settings.');
  assert.equal(containsGhnEnvironmentName(services.postgres.environment), false, 'PostgreSQL must not receive GHN settings.');
  assert.equal(containsGhnEnvironmentName(services.api.build), false, 'API image build must not receive GHN settings.');
  assert.equal(containsGhnEnvironmentName(services.web.build), false, 'Web image build must not receive GHN settings.');
}

const temporaryDirectory = await mkdtemp(path.join(repositoryDirectory, '.ghn-compose-'));

try {
  const dockerIgnore = await readFile(ignoredEnvironmentFile, 'utf8');
  assert.match(dockerIgnore, /^\*\*\/.env\*$/m, '.dockerignore must exclude environment files.');

  const configured = await renderComposeConfig(temporaryDirectory, true);
  assertGhnConfiguration(configured, {
    GHN_API_KEY: 'synthetic-ghn-api-key',
    GHN_SHOP_ID: '123',
    GHN_SHOP_IDS: '123,456',
  });

  const unconfigured = await renderComposeConfig(temporaryDirectory, false);
  assertGhnConfiguration(unconfigured, {
    GHN_API_KEY: '',
    GHN_SHOP_ID: '',
    GHN_SHOP_IDS: '',
  });

  console.log('GHN Docker Compose configuration test passed.');
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
