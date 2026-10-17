import {chromium} from '@playwright/test';
const b=await chromium.launch({channel:'msedge',headless:true});
const page=await b.newPage({viewport:{width:375,height:812},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://telegram.org/**',route=>route.abort());await page.goto('http://127.0.0.1:8787',{waitUntil:'domcontentloaded'});await page.waitForSelector('.tap-button');
await page.locator('.tap-button').click();
console.log('after tap',await page.locator('#balance').textContent());
await page.locator('#daily').click();
console.log('after daily',await page.locator('#balance').textContent());
await page.locator('[data-page=upgrades]').click();await page.locator('[data-upgrade=tap]').click();
console.log('upgrade',await page.locator('article').first().innerText());
await page.locator('[data-page=quests]').click();console.log('quests',await page.locator('article').count());
await page.locator('[data-page=play]').click();await page.screenshot({path:'artifacts/mobile.png',fullPage:true});
console.log('overflow',await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
await page.reload();await page.waitForSelector('#balance');console.log('persist balance',await page.locator('#balance').textContent());
await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'artifacts/desktop.png',fullPage:true});console.log('errors',errors);
await b.close();

