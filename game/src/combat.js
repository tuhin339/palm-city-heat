// Gunplay: a pistol that aims where the mouse points, bullets that travel and spark off
// whatever they meet, and the Solana Kings — rival fighters who close in, strafe, dodge
// traffic and shoot back with more enthusiasm than accuracy. The player heals once the
// shooting has been over for a while; a fighter who falls lies still and fades, no gore.
import { COMBAT, PALETTE, PLAYER } from './config.js';
import { segmentBlocked } from './world.js';
import { pointInCar, resolveCircleAgainstBuildings } from './entities.js';
import { reportCrime } from './police.js';

const GANG_SHIRTS = [PALETTE.gangShirt, '#2e2140', '#51386e', PALETTE.gangShirt, '#38284e'];
const GANG_SKINS = ['#e8b08a', '#c68863', '#8d5a3b', '#f1c27d'];

export function createCombat(game) {
  game.bullets = [];
  game.gang = [];
  game.combatState = {
    fireTimer: 0,
    lastDamageAt: -100,
    prevHealth: game.player.health,
  };
}

/** One Solana King: a fighter with somewhere to stand, a gun, and a short temper. */
export function createGangMember(random, x, y) {
  return {
    x, y, vx: 0, vy: 0,
    angle: random() * Math.PI * 2,
    radius: 12,
    health: 100,
    state: 'idle', // 'idle' | 'fight' | 'down'
    fireTimer: 0.4 + random() * 0.8,
    strafeDir: random() < 0.5 ? -1 : 1,
    strafeTimer: 1 + random() * 1.2,
    dodgeTimer: 0,
    fade: 1,
    shirt: GANG_SHIRTS[Math.floor(random() * GANG_SHIRTS.length)],
    skin: GANG_SKINS[Math.floor(random() * GANG_SKINS.length)],
  };
}

/** How many Kings are still on their feet. */
export function gangRemaining(game) {
  let count = 0;
  for (const member of game.gang) if (member.state !== 'down') count += 1;
  return count;
}

/** Hurt the player from any source that routes through here: bullets, mostly. */
export function damagePlayer(game, amount) {
  const player = game.player;
  if (game.over || player.health <= 0) return;
  player.health = Math.max(game.cinematic ? 5 : 0, player.health - amount);
  game.combatState.lastDamageAt = game.time;
  game.hurtFlash = 1;
}

function fireBullet(game, from, x, y, angle) {
  game.bullets.push({
    x, y,
    vx: Math.cos(angle) * COMBAT.bulletSpeed,
    vy: Math.sin(angle) * COMBAT.bulletSpeed,
    life: COMBAT.bulletLife,
    from,
  });
  if (game.fx) {
    game.fx.addSpark(x, y, Math.cos(angle) * 60, Math.sin(angle) * 60, PALETTE.spark);
    game.fx.addSpark(x, y, Math.cos(angle + 2.6) * 40, Math.sin(angle + 2.6) * 40, PALETTE.spark);
  }
}

/** A point inside any building: where bullets stop with a spark. */
function pointInBuilding(city, x, y) {
  for (const building of city.buildings) {
    if (x >= building.x && x < building.x + building.w && y >= building.y && y < building.y + building.h) return true;
  }
  return false;
}

function stepBullets(game, dt) {
  const player = game.player;
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = game.bullets[i];
    bullet.life -= dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    let dead = bullet.life <= 0;
    if (!dead && pointInBuilding(game.city, bullet.x, bullet.y)) {
      if (game.fx) game.fx.addSpark(bullet.x, bullet.y, -bullet.vx * 0.12, -bullet.vy * 0.12, PALETTE.spark);
      dead = true;
    }
    if (!dead) {
      for (const car of game.cars) {
        if (Math.abs(car.x - bullet.x) > 52 || Math.abs(car.y - bullet.y) > 52) continue;
        if (!pointInCar(car, bullet.x, bullet.y, 0)) continue;
        if (game.fx) game.fx.addSpark(bullet.x, bullet.y, -bullet.vx * 0.15, -bullet.vy * 0.15, PALETTE.spark);
        if (car.cop) reportCrime(game, 'copHit', bullet.x, bullet.y);
        dead = true;
        break;
      }
    }
    if (!dead && bullet.from === 'gang' && !player.car) {
      if (Math.hypot(player.x - bullet.x, player.y - bullet.y) < player.radius + 3) {
        damagePlayer(game, COMBAT.gangBulletDamage);
        if (game.fx) game.fx.addSpark(bullet.x, bullet.y, 0, 0, '#e5534b');
        dead = true;
      }
    }
    if (!dead && bullet.from === 'player') {
      for (const member of game.gang) {
        if (member.state === 'down') continue;
        if (Math.hypot(member.x - bullet.x, member.y - bullet.y) < member.radius + 3) {
          member.health -= COMBAT.bulletDamage;
          member.state = 'fight';
          if (game.fx) game.fx.addSpark(bullet.x, bullet.y, 0, 0, '#e5534b');
          if (member.health <= 0) {
            member.state = 'down';
            member.fade = 1;
            member.vx = 0;
            member.vy = 0;
          }
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const ped of game.peds) {
          if (ped.state === 'down') continue;
          if (Math.hypot(ped.x - bullet.x, ped.y - bullet.y) < 12) {
            ped.state = 'down';
            ped.timer = 1.3;
            ped.downBy = 'player';
            ped.crimeCounted = false;
            if (game.fx) game.fx.addDust(ped.x, ped.y, 4, 50);
            dead = true;
            break;
          }
        }
      }
    }
    if (dead) game.bullets.splice(i, 1);
  }
}

/** One fighter for one step: wake, keep a fighting distance, strafe, dodge cars, shoot. */
function stepGangMember(game, member, dt) {
  const player = game.player;
  const focus = player.car ?? player;
  if (member.state === 'down') {
    member.fade -= dt / COMBAT.fadeSeconds;
    return;
  }
  member.fireTimer -= dt;
  member.strafeTimer -= dt;
  member.dodgeTimer -= dt;
  if (member.strafeTimer <= 0) {
    member.strafeTimer = 0.9 + game.random() * 1.2;
    member.strafeDir = -member.strafeDir;
  }
  const dx = focus.x - member.x;
  const dy = focus.y - member.y;
  const distance = Math.hypot(dx, dy) || 1;
  if (member.state === 'idle') {
    if (distance < 300 || member.health < 100) member.state = 'fight';
    else {
      member.vx *= Math.max(0, 1 - 8 * dt);
      member.vy *= Math.max(0, 1 - 8 * dt);
      member.x += member.vx * dt;
      member.y += member.vy * dt;
      return;
    }
  }

  // A fast car coming straight at a fighter is dodged sideways, when he sees it in time.
  if (member.dodgeTimer <= 0) {
    for (const car of game.cars) {
      const speed = Math.hypot(car.vx, car.vy);
      if (speed < 150) continue;
      const toX = member.x - car.x;
      const toY = member.y - car.y;
      const gap = Math.hypot(toX, toY);
      if (gap > 100 || gap < 1) continue;
      const closing = (car.vx * toX + car.vy * toY) / gap;
      if (closing < speed * 0.65) continue;
      const side = (car.vx * toY - car.vy * toX) >= 0 ? 1 : -1;
      const away = Math.atan2(toY, toX) + side * 0.9;
      member.vx += Math.cos(away) * 300;
      member.vy += Math.sin(away) * 300;
      member.dodgeTimer = 1.1;
      break;
    }
  }
  // Run down despite the dodge: a fighter under a fast car goes down like anyone would.
  if (member.dodgeTimer <= 0.4) {
    for (const car of game.cars) {
      if (Math.hypot(car.vx, car.vy) > 120 && pointInCar(car, member.x, member.y, 2)) {
        member.health = 0;
        member.state = 'down';
        member.fade = 1;
        member.vx = 0;
        member.vy = 0;
        return;
      }
    }
  }

  member.angle = Math.atan2(dy, dx);
  let moveX = 0;
  let moveY = 0;
  if (distance > COMBAT.gangKeepFar) {
    moveX = dx / distance;
    moveY = dy / distance;
  } else if (distance < COMBAT.gangKeepNear) {
    moveX = -dx / distance;
    moveY = -dy / distance;
  } else {
    moveX = (-dy / distance) * member.strafeDir;
    moveY = (dx / distance) * member.strafeDir;
  }
  member.vx += (moveX * COMBAT.gangSpeed - member.vx) * Math.min(1, 9 * dt);
  member.vy += (moveY * COMBAT.gangSpeed - member.vy) * Math.min(1, 9 * dt);
  member.x += member.vx * dt;
  member.y += member.vy * dt;
  resolveCircleAgainstBuildings(game.city, member, member.radius);
  member.x = Math.max(12, Math.min(game.city.width - 12, member.x));
  member.y = Math.max(12, Math.min(game.city.waterY - 8, member.y));

  // Shoot back, when the range and the line are both good: enthusiasm over accuracy.
  if (distance < COMBAT.gangRange && member.fireTimer <= 0
    && !segmentBlocked(game.city, member.x, member.y, focus.x, focus.y)) {
    member.fireTimer = COMBAT.gangFireMin + game.random() * (COMBAT.gangFireMax - COMBAT.gangFireMin);
    const spread = (game.random() - 0.5) * (0.1 + distance / COMBAT.gangRange * 0.14);
    const lead = player.car ? 0.12 : 0.04;
    const aimX = focus.x + focus.vx * lead;
    const aimY = focus.y + focus.vy * lead;
    fireBullet(game, 'gang', member.x + Math.cos(member.angle) * 15, member.y + Math.sin(member.angle) * 15,
      Math.atan2(aimY - member.y, aimX - member.x) + spread);
    game.sound.play('shot');
  }
}

/**
 * One step of the fighting: the player's own shots (on foot, aimed by the controls' aim
 * point), every bullet's flight, every fighter's move, and the slow heal once the player
 * has gone long enough without being hit.
 */
export function stepCombat(game, dt, controls) {
  const player = game.player;
  const state = game.combatState;

  // Damage from any source (a knock from traffic counts too) restarts the heal clock.
  if (player.health < state.prevHealth) {
    state.lastDamageAt = game.time;
    game.hurtFlash = Math.max(game.hurtFlash, 0.75);
  }
  state.prevHealth = player.health;
  game.hurtFlash = Math.max(0, game.hurtFlash - dt * 1.25);

  state.fireTimer -= dt;
  if (controls.fire && !player.car && !game.over && player.health > 0) {
    player.angle = Math.atan2(controls.aimY - player.y, controls.aimX - player.x);
    if (state.fireTimer <= 0) {
      state.fireTimer = COMBAT.fireInterval;
      const spread = (game.random() - 0.5) * 0.035;
      fireBullet(game, 'player',
        player.x + Math.cos(player.angle) * 16, player.y + Math.sin(player.angle) * 16,
        player.angle + spread);
      game.sound.play('shot');
      reportCrime(game, 'shots', player.x, player.y);
    }
  }

  stepBullets(game, dt);
  for (let i = game.gang.length - 1; i >= 0; i -= 1) {
    stepGangMember(game, game.gang[i], dt);
    if (game.gang[i].state === 'down' && game.gang[i].fade <= 0) game.gang.splice(i, 1);
  }

  if (!game.over && player.health > 0 && game.time - state.lastDamageAt > COMBAT.regenDelay) {
    player.health = Math.min(PLAYER.maxHealth, player.health + COMBAT.regenRate * dt);
    state.prevHealth = player.health;
  }
}
