"""Persistent, event-driven client careers and accountable conversations."""
from __future__ import annotations

from copy import deepcopy
from functools import lru_cache
import json
from pathlib import Path
from .events import Event, Severity, ev
from .systems.development import playing_time
from .systems.trust import adjust


@lru_cache(maxsize=1)
def _config():
    return json.loads((Path(__file__).resolve().parent.parent / 'data' / 'career_expansion.json').read_text())


def _n(balance, key, default):
    return balance.f('careers.' + key, _config()[key])


def _history(world, pid, kind, message, delta=0):
    rows = world.career_state.history.setdefault(pid, [])
    row = dict(week=world.week, kind=kind, message=message, trust_delta=round(delta, 2))
    if not rows or rows[-1] != row:
        rows.append(row)


def _change(world, balance, pid, value, reason):
    delta = adjust(world, balance, pid, value)
    _history(world, pid, 'career.trust', reason, delta)
    if pid in world.career_state.careers and pid in world.clients:
        world.career_state.careers[pid].update(last_trust=world.clients[pid].trust, trust=world.clients[pid].trust)
    return ev('career.trust', reason, world.week, player_id=pid, delta=delta)


def _goal(world, balance, pid):
    p = world.players[pid]
    if p.is_injured:
        kind, title, target = 'recovery', 'Return to fitness', 1
    elif p.club_id is None:
        kind, title, target = 'club', 'Find a club', 1
    elif p.trait.value == 'mercenary':
        kind, title, target = 'wages', 'Secure a better wage', round(p.contract.wage * _n(balance, 'wage_goal_multiplier', 1.15), 2) if p.contract else 1
    elif p.trait.value == 'loyal':
        kind, title, target = 'loyalty', 'Build a lasting home', _n(balance, 'loyalty_weeks', 12)
    else:
        kind, title, target = 'playing_time', 'Earn regular first-team football', _n(balance, 'playing_goal_weeks', 6)
    return dict(id=f'{pid}:goal:{world.week}', kind=kind, title=title, target=target, progress=0,
                created_week=world.week, deadline_week=world.week + int(_n(balance, 'goal_deadline_weeks', 26)),
                status='active', club_id=p.club_id, last_progress_week=world.week)


def initialize(world, balance):
    s = world.career_state
    for pid, record in world.clients.items():
        p = world.players[pid]
        if pid not in s.careers:
            s.careers[pid] = dict(player_id=pid, name=p.name, joined_week=record.signed_week,
                                  trust=record.trust, last_trust=record.trust, active=True, cooldowns={})
            s.goals[pid] = _goal(world, balance, pid)
            _history(world, pid, 'career.started', f'{p.name} joined the agency.')
            # Old saves had no deadline or promise date. Give a fresh full deadline.
            if record.promised_move:
                promise_move(world, balance, pid)
        elif not s.careers[pid].get('active', True):
            s.careers[pid].update(active=True, joined_week=record.signed_week, last_trust=record.trust)
            s.goals[pid] = _goal(world, balance, pid)
            _history(world, pid, 'career.rejoined', f'{p.name} returned to the agency.')


def promise_move(world, balance, pid):
    s = world.career_state
    if pid not in world.clients:
        return None
    for promise in s.promises.values():
        if promise['player_id'] == pid and promise['status'] == 'active':
            return promise
    previous = [v for v in s.promises.values() if v['player_id'] == pid]
    if previous and world.week < max(v.get('resolved_week', v['created_week']) for v in previous) + _n(balance, 'promise_cooldown_weeks', 8):
        return None
    key = f'{pid}:move:{world.week}'
    promise = dict(id=key, player_id=pid, kind='move', status='active', created_week=world.week,
                   deadline_week=world.week + int(_n(balance, 'promise_deadline_weeks', 12)),
                   original_club_id=world.players[pid].club_id)
    s.promises[key] = promise
    world.clients[pid].promised_move = True
    _history(world, pid, 'career.promise', 'Promised a move before the agreed deadline.')
    return promise


def fulfill_move(world, balance, pid):
    events = []
    for promise in world.career_state.promises.values():
        if promise['player_id'] == pid and promise['status'] == 'active':
            promise.update(status='fulfilled', resolved_week=world.week)
            events.append(_change(world, balance, pid, _n(balance, 'promise_success_trust', 6), 'Delivered the promised move.'))
    if pid in world.clients:
        world.clients[pid].promised_move = False
    return events


_STORIES = {
    'playing_time': ('Minutes matter', 'Your client wants a clearer route into the first team.'),
    'wages': ('A question of value', 'Your client wants their earnings to reflect their progress.'),
    'injury_recovery': ('The recovery road', 'An injury has interrupted your client’s plans.'),
    'breakthrough': ('A breakthrough season', 'Your client has taken a step forward and wants to discuss what comes next.'),
    'renewal_loyalty': ('A longer commitment', 'Your client is considering the next chapter of their contract.'),
    'rival_warning': ('Another agent is calling', 'A rival approach has put your relationship under scrutiny.'),
}
_EVENT_STORY = {'client.injured':'injury_recovery', 'client.recovered':'injury_recovery',
                'client.developed':'breakthrough', 'transfer.club_contract_expiring':'renewal_loyalty',
                'client.agent_contract_expiring':'renewal_loyalty', 'transfer.renewal':'renewal_loyalty',
                'rival.poach_attempt':'rival_warning', 'rival.warning':'rival_warning'}


def record_event(world, event):
    pid = event.data.get('player_id')
    if pid is None or pid not in world.career_state.careers:
        return
    _history(world, pid, event.kind, event.message, event.data.get('delta', 0))
    c = world.career_state.careers[pid]
    if event.kind in ('client.left', 'client.poached', 'client.retired'):
        c['departure_reason'] = event.data.get('reason', event.kind)
    kind = _EVENT_STORY.get(event.kind)
    if kind:
        c.setdefault('pending_stories', {})[kind] = event.message


def _options(kind):
    practical = {'playing_time': 'Explore a move for more minutes', 'wages': 'Explore better-paid opportunities',
                 'injury_recovery': 'Agree a recovery-first plan', 'breakthrough': 'Plan regular first-team football',
                 'renewal_loyalty': 'Commit to continuity', 'rival_warning': 'Review career priorities'}
    options = [dict(id='honest', label='Have an honest conversation', consequence='Small trust benefit; no commitment.'),
               dict(id='practical', label=practical[kind], consequence='Take a concrete career step and close this conversation.')]
    if kind in ('playing_time', 'wages', 'breakthrough'):
        options.append(dict(id='promise', label='Promise a move', consequence='A tracked deadline: trust rises only if delivered.'))
    return options


def _open_story(world, balance, pid, kind, body=None):
    s = world.career_state
    c = s.careers[pid]
    if c['cooldowns'].get(kind, -1) > world.week:
        return None
    if any(x['player_id'] == pid and x['kind'] == kind and x['status'] == 'active' for x in s.stories.values()):
        return None
    key = f'{pid}:{kind}:{world.week}'
    title, default_body = _STORIES[kind]
    s.stories[key] = dict(id=key, player_id=pid, kind=kind, title=title, body=body or default_body,
                         status='active', created_week=world.week, options=_options(kind))
    c['cooldowns'][kind] = world.week + int(_n(balance, 'story_cooldown_weeks', 16))
    _history(world, pid, 'career.story', title)
    return ev('career.story', f'{c["name"]}: {title}', world.week, Severity.ACTION, player_id=pid, story_id=key)


def reconcile_departures(world):
    """Archive departed clients immediately, without running a weekly review."""
    s = world.career_state
    for pid, c in s.careers.items():
        if pid not in world.clients:
            if c.get('active', True):
                c['active'] = False
                for x in list(s.promises.values()) + list(s.stories.values()):
                    if x['player_id'] == pid and x['status'] == 'active':
                        x.update(status='closed', resolved_week=world.week)
                if s.goals[pid]['status'] == 'active':
                    s.goals[pid]['status'] = 'closed'
                _history(world, pid, 'career.departed', f'{c["name"]} left the agency: {c.get("departure_reason", "representation ended")}.')
                s.alumni[pid] = dict(player_id=pid, name=c['name'], joined_week=c['joined_week'], left_week=world.week,
                                    reason=c.get('departure_reason', 'representation ended'), trust=c['trust'],
                                    timeline=deepcopy(s.history.get(pid, [])))


def run(world, r, balance):
    initialize(world, balance)
    s = world.career_state
    events = []
    reconcile_departures(world)
    for pid, c in s.careers.items():
        if pid not in world.clients:
            continue
        p, rec = world.players[pid], world.clients[pid]
        baseline_delta = rec.trust - c.get('last_trust', rec.trust)
        if abs(baseline_delta) > .01:
            _history(world, pid, 'career.trust_context', 'Playing time, career decisions and relationship changes since the previous review.', baseline_delta)
        goal = s.goals[pid]
        if goal['status'] == 'active' and goal['last_progress_week'] < world.week:
            goal['last_progress_week'] = world.week
            kind = goal['kind']
            pt = playing_time(balance, p, world.clubs.get(p.club_id))
            if kind == 'playing_time' and pt.value in ('starter', 'key'):
                goal['progress'] += 1
            elif kind == 'loyalty' and p.club_id == goal['club_id'] and not p.is_injured:
                goal['progress'] += 1
            elif kind == 'recovery':
                goal['progress'] = int(not p.is_injured)
            elif kind == 'club':
                goal['progress'] = int(p.club_id is not None)
            elif kind == 'wages':
                goal['progress'] = p.contract.wage if p.contract else 0
            if goal['progress'] >= goal['target']:
                goal.update(status='completed', resolved_week=world.week)
                events.append(_change(world, balance, pid, _n(balance, 'goal_success_trust', 3), f'Career goal completed: {goal["title"]}.'))
            elif world.week >= goal['deadline_week']:
                goal.update(status='missed', resolved_week=world.week)
                events.append(_change(world, balance, pid, -_n(balance, 'goal_failure_trust', 2), f'Career goal missed: {goal["title"]}.'))
        elif goal['status'] != 'active' and world.week >= goal.get('resolved_week', world.week) + _n(balance, 'goal_cooldown_weeks', 4):
            s.goals[pid] = _goal(world, balance, pid)
        for promise in s.promises.values():
            if promise['player_id'] != pid or promise['status'] != 'active':
                continue
            if p.club_id is not None and p.club_id != promise['original_club_id']:
                events.extend(fulfill_move(world, balance, pid))
            elif world.week >= promise['deadline_week']:
                promise.update(status='failed', resolved_week=world.week)
                rec.promised_move = False
                events.append(_change(world, balance, pid, -_n(balance, 'promise_failure_trust', 10), 'The promised move deadline passed without a move.'))
        pending = c.pop('pending_stories', {})
        if not p.is_injured and playing_time(balance, p, world.clubs.get(p.club_id)).value in ('reserve', 'fringe'):
            pending.setdefault('playing_time', None)
        if p.trait.value == 'mercenary' and goal['kind'] == 'wages' and world.week > goal['created_week']:
            pending.setdefault('wages', None)
        for kind, body in pending.items():
            event = _open_story(world, balance, pid, kind, body)
            if event:
                events.append(event)
        c.update(trust=rec.trust, last_trust=rec.trust)
    return events


def state(world, balance):
    s = world.career_state
    clients = []
    for pid, rec in world.clients.items():
        p = world.players[pid]
        history = s.history.get(pid, [])
        clients.append(dict(player_id=pid, name=p.name, trait=p.trait.value, trust=round(rec.trust, 2),
            goal=deepcopy(s.goals.get(pid)), promises=[deepcopy(x) for x in s.promises.values() if x['player_id'] == pid],
            stories=[deepcopy(x) for x in s.stories.values() if x['player_id'] == pid and x['status'] == 'active'],
            timeline=deepcopy(history), trust_explanation=[x['message'] + f' ({x["trust_delta"]:+g})' for x in history if x['trust_delta']][-5:]))
    return dict(week=world.week, clients=clients, alumni=deepcopy(list(s.alumni.values())))


def action(world, balance, operation, payload):
    from .actions import ActionResult
    initialize(world, balance)
    if operation != 'respond':
        return ActionResult(False, 'Unknown career operation.')
    story = world.career_state.stories.get(str(payload.get('story_id', '')))
    choice = payload.get('option_id')
    if story is None or story['status'] != 'active' or story['player_id'] not in world.clients:
        return ActionResult(False, 'This conversation is no longer available.')
    if choice not in [x['id'] for x in story['options']]:
        return ActionResult(False, 'Choose one of the available responses.')
    pid = story['player_id']
    p = world.players[pid]
    events = []
    if choice == 'promise':
        if promise_move(world, balance, pid) is None:
            return ActionResult(False, 'A recent promise must settle before you make another.')
        p.seeking_move = True
    elif choice == 'honest':
        events.append(_change(world, balance, pid, _n(balance, 'honest_trust', 1), f'Honest conversation: {story["title"]}.'))
    else:
        if story['kind'] in ('playing_time', 'wages'):
            p.seeking_move = True
        elif story['kind'] == 'injury_recovery':
            p.seeking_move = False
            world.career_state.goals[pid] = _goal(world, balance, pid)
        elif story['kind'] == 'renewal_loyalty':
            p.seeking_move = False
            goal = _goal(world, balance, pid)
            goal.update(kind='loyalty', title='Build a lasting home', target=_n(balance, 'loyalty_weeks', 12), progress=0)
            world.career_state.goals[pid] = goal
        else:
            world.career_state.goals[pid] = _goal(world, balance, pid)
        events.append(_change(world, balance, pid, _n(balance, 'practical_trust', 1), f'Agreed a practical plan: {story["title"]}.'))
    story.update(status='resolved', selected_option=choice, resolved_week=world.week)
    _history(world, pid, 'career.response', f'{story["title"]}: {next(x["label"] for x in story["options"] if x["id"] == choice)}.')
    world.career_state.careers[pid]['last_trust'] = world.clients[pid].trust
    return ActionResult(True, 'Career plan updated.', events)


def open_decisions(world, balance):
    from .decisions import Decision
    if world.game_over:
        return []
    result = []
    for story in world.career_state.stories.values():
        if story['status'] == 'active' and story['player_id'] in world.clients:
            result.append(Decision(id=story['id'], kind='career.story', severity=Severity.ACTION,
                headline=story['title'], detail=story['body'], player_id=story['player_id'],
                extra={'href': '/careers', 'story_id': story['id']}))
    for promise in world.career_state.promises.values():
        if promise['status'] == 'active' and promise['player_id'] in world.clients:
            result.append(Decision(id=promise['id'], kind='career.promise', severity=Severity.WARNING,
                headline='Deliver the promised move', detail='A move was promised; missing the deadline damages trust.',
                player_id=promise['player_id'], weeks_left=max(0, promise['deadline_week'] - world.week),
                extra={'href': '/careers', 'promise_id': promise['id']}))
    return result
