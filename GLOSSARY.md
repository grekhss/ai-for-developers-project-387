# Calendar of Meetings

A shared calendar for booking meeting slots: an admin defines the types of
meetings on offer, and guests reserve a free time slot for one of them.

## Access

**Shared password**:
The secret that lets a guest open a session. It is shared, so it identifies no one.
_Avoid_: access code, guest password, login

**Admin password**:
The secret that opens a session in the admin role. It is not shared.
_Avoid_: root password, master password

**Session**:
A period during which someone who entered a password may use the app. It carries
a role and, for a guest, the Booker name they declared.
_Avoid_: cookie, token, login

**Role**:
What a session entitles its holder to do: admin or guest.
_Avoid_: permission, access level, user type

**Admin**:
The role that defines the types of meetings on offer and observes all planned
meetings. An admin does not book.
_Avoid_: administrator, superuser, owner

**Guest**:
The role that books meetings. A guest declares a Booker name and reserves a free
slot for a meeting of a chosen type.
_Avoid_: visitor, client, user

**Booker**:
The self-declared name attached to a meeting. It is not an identity and carries
no rights.
_Avoid_: owner, user, account

**Authenticated**:
Describes a request or viewer that carries a valid session.
_Avoid_: logged in, authorized

**Anonymous**:
Describes a request or viewer with no session.
_Avoid_: visitor, public

## Meetings

**Meeting type**:
A named category of meeting, with a description, that a guest may choose when
booking.
_Avoid_: event type, meeting kind, category

**Slot**:
A fixed half-hour position on a working day that holds at most one meeting.
_Avoid_: timeslot, time cell, appointment slot

**Meeting**:
A reserved slot together with the meeting type it was booked under and the
Booker who booked it.
_Avoid_: booking, appointment, event
