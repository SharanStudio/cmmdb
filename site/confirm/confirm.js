// Confirm page: (1) "Is this you?" answers (?d=yes|no) and (2) member re-consent (?r=keep|remove).
// It talks only to our Apps Script web app.
(function () {
  'use strict';
  var API = 'https://script.google.com/macros/s/AKfycbzasJVPoxyQmEfWHj_FKcxn8x-fcvlVZXZoDwp2VHLI1uidJGPi9qkbw7k5owNfwG3wUw/exec';

  var q = new URLSearchParams(location.search);
  var token = q.get('t') || '';
  var choice = q.get('d') === 'no' ? 'no' : (q.get('d') === 'yes' ? 'yes' : '');
  var rmode = q.get('r') === 'remove' ? 'remove' : (q.get('r') === 'keep' ? 'keep' : '');
  var $ = function (id) { return document.getElementById(id); };
  var title = $('title'), msg = $('msg'), box = $('details'), go = $('go'), pick = $('choice'), consent = $('consent');

  function say(t, m) { title.textContent = t; msg.textContent = m || ''; }
  function post(payload) {
    // text/plain avoids a CORS preflight; Apps Script reads the body as a string.
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); });
  }
  function line(label, value) {
    var p = document.createElement('p');
    var b = document.createElement('strong');
    b.textContent = label + ': ';
    p.appendChild(b);
    p.appendChild(document.createTextNode(value || '-'));
    box.appendChild(p);
  }
  function invalid() { say('This link is not valid', 'Please use the buttons in the latest email we sent you.'); }

  if (API.indexOf('http') !== 0) { say('Not available yet', 'This page is not switched on. Please email us instead.'); return; }
  if (!token || (!choice && !rmode)) { say('This link is not valid', 'Please use the buttons in the email we sent you.'); return; }

  // ---- Re-consent flow (existing members) ----
  if (rmode) {
    post({ a: 'rpreview', t: token }).then(function (r) {
      if (!r || !r.ok) { invalid(); return; }
      if (r.status === 'expired') { say('This link has expired', 'Your profile stays listed with your email hidden. Write to us to change anything.'); return; }
      if (r.status === 'used') { say('Already received', 'We have your answer. Email us if you want to change it.'); return; }
      box.hidden = false;
      line('Profile', r.name);
      line('Login email', r.email);
      if (rmode === 'keep') {
        say('Keep my profile', 'Choose how your email appears, then confirm.');
        pick.hidden = false;
        go.textContent = 'Confirm';
        go.disabled = true;
        consent.addEventListener('change', function () { go.disabled = !consent.checked; });
      } else {
        say('Remove my profile', 'We will delete your profile from the Directory and the website.');
        go.textContent = 'Confirm removal';
      }
      go.hidden = false;
    }).catch(function () { say('Something went wrong', 'Please try again in a minute, or email us.'); });

    go.addEventListener('click', function () {
      go.disabled = true;
      var body = { a: 'rdecide', t: token, r: rmode };
      if (rmode === 'keep') {
        body.consent = consent.checked === true;
        body.show = document.querySelector('input[name="show"]:checked').value;
      }
      post(body).then(function (r) {
        go.hidden = true; box.hidden = true; pick.hidden = true;
        if (r && r.ok) {
          say(rmode === 'keep' ? 'Thank you, we received your confirmation' : 'Your profile is removed',
              rmode === 'keep' ? 'Your choice is saved. The website updates within a day. You can write to us any time to change it.' : 'We also sent you a confirmation email.');
        } else say('We could not record that', (r && r.error) || 'Please email us.');
      }).catch(function () { go.disabled = false; say('Something went wrong', 'Please try again, or email us.'); });
    });
    return;
  }

  // ---- "Is this you?" flow ----
  post({ a: 'preview', t: token }).then(function (r) {
    if (!r || !r.ok) { invalid(); return; }
    if (r.status === 'expired') { say('This link has expired', 'Please email us and we will sort it out.'); return; }
    if (r.status === 'used') { say('Already received', 'We have your earlier answer. Email us if you want to change it.'); return; }
    box.hidden = false;
    line('New registration name', r.name);
    line('College', r.college);
    line('Email', r.email);
    say(choice === 'yes' ? 'You chose: Yes, this is me' : 'You chose: No, this is not me',
        choice === 'yes' ? 'We will keep one profile for you.' : 'We will hold the new registration for review.');
    go.hidden = false;
  }).catch(function () { say('Something went wrong', 'Please try again in a minute, or email us.'); });

  go.addEventListener('click', function () {
    go.disabled = true;
    post({ a: 'decide', t: token, d: choice }).then(function (r) {
      go.hidden = true; box.hidden = true;
      if (r && r.ok) say('Thank you, we received your confirmation', 'You can close this page. Email us any time if you want to change anything.');
      else say('We could not record that', (r && r.error) || 'Please email us.');
    }).catch(function () { go.disabled = false; say('Something went wrong', 'Please try again, or email us.'); });
  });
})();
