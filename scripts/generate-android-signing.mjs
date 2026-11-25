/**
 * أداة توليد واستخراج ملف التوقيع (Keystore) وبصمات الشهادة (SHA-1 / SHA-256) لحزمة com.zoryx
 * الاستخدام:
 *   - توليد ملف توقيع جديد + البصمات:
 *       node scripts/generate-android-signing.mjs
 *   - فحص ملف توقيع موجود واستخراج البصمات:
 *       node scripts/generate-android-signing.mjs --inspect [path/to/keystore]
 *   - تحديث public/.well-known/assetlinks.json بالبصمة:
 *       node scripts/generate-android-signing.mjs --inspect [path] --write-assetlinks
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

const rootDir = process.cwd();
const args = process.argv.slice(2);
const isInspectOnly = args.includes('--inspect');
const writeAssetLinks = args.includes('--write-assetlinks');
const nonFlagArgs = args.filter((a) => !a.startsWith('--'));

const defaultSigningDir = path.join(rootDir, '.android-signing');
const defaultKeystorePath = path.resolve(
  rootDir,
  nonFlagArgs[0] || process.env.ANDROID_KEYSTORE_PATH || path.join(defaultSigningDir, 'zoryx-release.keystore')
);
const keyAlias = (process.env.ANDROID_KEY_ALIAS || 'zoryx-release').trim();

function commandExists(cmd) {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    stdio: 'ignore',
  });
  return probe.status === 0;
}

function runChecked(cmd, cmdArgs, extraOpts = {}) {
  const res = spawnSync(cmd, cmdArgs, {
    encoding: 'utf8',
    ...extraOpts,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const details = (res.stderr || res.stdout || '').trim();
    throw new Error(`فشل تنفيذ ${cmd}: ${details || `code ${res.status}`}`);
  }
  return res.stdout || '';
}

function formatColonHex(hex) {
  return hex.toUpperCase().match(/.{1,2}/g)?.join(':') || hex.toUpperCase();
}

function extractFingerprintsWithOpenSsl(keystorePath, password) {
  // Extract X509 cert PEM from PKCS12, then compute exact DER SHA-1 / SHA-256
  const certPem = runChecked('openssl', [
    'pkcs12',
    '-in',
    keystorePath,
    '-clcerts',
    '-nokeys',
    '-passin',
    `pass:${password}`,
  ]);

  const certDerBase64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');

  if (!certDerBase64) {
    throw new Error('لم يتم العثور على شهادة عامة صالحة داخل ملف التوقيع.');
  }

  const derBuffer = Buffer.from(certDerBase64, 'base64');
  const sha1 = formatColonHex(crypto.createHash('sha1').update(derBuffer).digest('hex'));
  const sha256 = formatColonHex(crypto.createHash('sha256').update(derBuffer).digest('hex'));

  const subjectOut = runChecked('openssl', ['x509', '-noout', '-subject', '-dates'], {
    input: certPem,
  }).trim();

  return { sha1, sha256, details: subjectOut };
}

function extractFingerprintsWithKeytool(keystorePath, password) {
  const out = runChecked('keytool', [
    '-list',
    '-v',
    '-keystore',
    keystorePath,
    '-storepass',
    password,
  ]);
  const sha1Match = out.match(/SHA1:\s*([0-9A-Fa-f:]+)/);
  const sha256Match = out.match(/SHA256:\s*([0-9A-Fa-f:]+)/);
  if (!sha1Match || !sha256Match) {
    throw new Error('تعذر قراءة بصمتي SHA-1 و SHA-256 من مخرجات keytool.');
  }
  return {
    sha1: sha1Match[1].toUpperCase(),
    sha256: sha256Match[1].toUpperCase(),
    details: out,
  };
}

function extractFingerprints(keystorePath, password) {
  if (commandExists('keytool')) {
    try {
      return extractFingerprintsWithKeytool(keystorePath, password);
    } catch {
      // fallback to openssl if PKCS12/OpenSSL works better
    }
  }
  if (commandExists('openssl')) {
    return extractFingerprintsWithOpenSsl(keystorePath, password);
  }
  throw new Error('يتطلب استخراج البصمة توفر keytool (JDK) أو openssl.');
}

function generateKeystore(keystorePath, storePassword, keyPassword, alias) {
  fs.mkdirSync(path.dirname(keystorePath), { recursive: true });

  if (commandExists('keytool')) {
    runChecked('keytool', [
      '-genkeypair',
      '-v',
      '-storetype',
      'PKCS12',
      '-keystore',
      keystorePath,
      '-alias',
      alias,
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
      '-storepass',
      storePassword,
      '-keypass',
      keyPassword,
      '-dname',
      'CN=Anime MOD, OU=Mobile, O=Zoryx, L=Riyadh, S=Riyadh, C=SA',
    ]);
    return;
  }

  if (commandExists('openssl')) {
    const tmpDir = fs.mkdtempSync(path.join(path.dirname(keystorePath), '.tmp-sign-'));
    const keyFile = path.join(tmpDir, 'key.pem');
    const certFile = path.join(tmpDir, 'cert.pem');
    try {
      runChecked('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-keyout',
        keyFile,
        '-out',
        certFile,
        '-days',
        '10000',
        '-nodes',
        '-subj',
        '/CN=Anime MOD/OU=Mobile/O=Zoryx/L=Riyadh/ST=Riyadh/C=SA',
      ]);
      runChecked('openssl', [
        'pkcs12',
        '-export',
        '-out',
        keystorePath,
        '-inkey',
        keyFile,
        '-in',
        certFile,
        '-name',
        alias,
        '-passout',
        `pass:${storePassword}`,
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    return;
  }

  throw new Error('يتطلب إنشاء ملف التوقيع توفر JDK (keytool) أو OpenSSL.');
}

function updateAssetLinksFile(sha256) {
  const assetLinksPath = path.join(rootDir, 'public/.well-known/assetlinks.json');
  fs.mkdirSync(path.dirname(assetLinksPath), { recursive: true });
  const payload = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.zoryx',
        sha256_cert_fingerprints: [sha256],
      },
    },
  ];
  fs.writeFileSync(assetLinksPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`✅ تم تحديث ${path.relative(rootDir, assetLinksPath)} بالبصمة SHA-256.`);
}

function main() {
  let storePassword = (process.env.ANDROID_KEYSTORE_PASSWORD || '').trim();
  let keyPassword = (process.env.ANDROID_KEY_PASSWORD || storePassword || '').trim();

  if (isInspectOnly) {
    if (!fs.existsSync(defaultKeystorePath)) {
      console.error(`❌ لم يتم العثور على ملف التوقيع في: ${defaultKeystorePath}`);
      process.exit(1);
    }
    if (!storePassword) {
      const propsPath = path.join(rootDir, 'android/keystore.properties');
      if (fs.existsSync(propsPath)) {
        const propsRaw = fs.readFileSync(propsPath, 'utf8');
        const m = propsRaw.match(/^storePassword=(.+)$/m);
        if (m?.[1]) storePassword = m[1].trim();
      }
    }
    if (!storePassword) {
      console.error('❌ يرجى تمرير ANDROID_KEYSTORE_PASSWORD لفحص ملف التوقيع.');
      process.exit(1);
    }
    const fp = extractFingerprints(defaultKeystorePath, storePassword);
    console.log('\n🔐 بصمات شهادة التوقيع لحزمة com.zoryx:');
    console.log(`   SHA-1  : ${fp.sha1}`);
    console.log(`   SHA-256: ${fp.sha256}\n`);
    if (writeAssetLinks) {
      updateAssetLinksFile(fp.sha256);
    }
    return;
  }

  if (fs.existsSync(defaultKeystorePath)) {
    console.log(`ℹ️ ملف التوقيع موجود بالفعل في: ${defaultKeystorePath}`);
    if (storePassword) {
      const fp = extractFingerprints(defaultKeystorePath, storePassword);
      console.log(`   SHA-1  : ${fp.sha1}`);
      console.log(`   SHA-256: ${fp.sha256}`);
      if (writeAssetLinks) updateAssetLinksFile(fp.sha256);
    } else {
      console.log('ℹ️ لفحصه واستخراج البصمة: ANDROID_KEYSTORE_PASSWORD=... npm run apk:fingerprint');
    }
    return;
  }

  if (!storePassword) {
    storePassword = crypto.randomBytes(18).toString('base64url');
  }
  if (!keyPassword) {
    keyPassword = storePassword;
  }

  generateKeystore(defaultKeystorePath, storePassword, keyPassword, keyAlias);
  const fp = extractFingerprints(defaultKeystorePath, storePassword);
  const keystoreBase64 = fs.readFileSync(defaultKeystorePath).toString('base64');

  // If android/ directory exists locally, wire android/keystore.properties cleanly
  const androidDir = path.join(rootDir, 'android');
  if (fs.existsSync(androidDir)) {
    const propsContent = [
      `storeFile=${path.relative(path.join(androidDir, 'app'), defaultKeystorePath).replace(/\\/g, '/')}`,
      `storePassword=${storePassword}`,
      `keyAlias=${keyAlias}`,
      `keyPassword=${keyPassword}`,
    ].join('\n');
    fs.writeFileSync(path.join(androidDir, 'keystore.properties'), `${propsContent}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  if (writeAssetLinks) {
    updateAssetLinksFile(fp.sha256);
  }

  console.log('\n✅ تم إنشاء ملف التوقيع الرسمي (PKCS12) بنجاح!');
  console.log(`📁 المسار: ${path.relative(rootDir, defaultKeystorePath)}`);
  console.log('\n📌 البصمات (أضف SHA-1 و SHA-256 في Firebase Console لتطبيق com.zoryx):');
  console.log(`   SHA-1  : ${fp.sha1}`);
  console.log(`   SHA-256: ${fp.sha256}`);
  console.log('\n🔒 أسرار GitHub Actions (Settings > Secrets and variables > Actions):');
  console.log(`   ANDROID_KEY_ALIAS       = ${keyAlias}`);
  console.log(`   ANDROID_KEYSTORE_PASSWORD = ${storePassword}`);
  console.log(`   ANDROID_KEY_PASSWORD    = ${keyPassword}`);
  console.log(`   ANDROID_KEYSTORE_BASE64 = ${keystoreBase64}`);
  console.log('\n⚠️ تنبيه أمني: احتفظ بنسخة احتياطية آمنة من ملف التوقيع وكلمات المرور ولا ترفعها داخل الكود.\n');
}

main();
