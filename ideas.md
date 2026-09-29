A personal work-rhythm app that combines:
- Pomodoro-style focused work
- multiple projects and activities
- physical movement breaks
- spaced repetition
- focus-loss tracking
- lightweight reflection

The goal is not simply to maximize time worked. The app should help the
user discover the conditions under which they can sustain focused work.

Pomodoro-based timing of multiple projects/activities
Each project can have multiple activities (like develop, test and review)
Between activity blocks I can run language learning and physical activity blocks
- Spaced repetition like in anki
- Recommend 10 min walk between activities etc?

Each project can have a dashboard with notes and images
- Similar to figmas canvas with notes and images and you can pan and scroll around it

Should have a button for "Lost focus" and record the time it takes to fail an activity and the context surrounding the failure. Should also have a button to "End activity early" which should be treated separately. Should also record happiness and energy levels at the beginning of the session, so we can investigate what predicts loss of focus.

So the complete flow should be:
Enter website
Record happiness and energy levels
See planned blocks for today
User should be able to set his maximum number of new cards to memorize in a day.
User should be able to manage flashcards for memorization. Cards should consist of front, back, and bottom (only applicable if the card is mirrored, in which case display bottom text on flipped face of both original and mirrored cards)
User should be able to set length of work day (defaults to 5 hours).
Should be able to create new projects and new activities.
Should be able to move blocks around for today.
Should have a play button to start the pomodoro timer.
When an activity block starts, move to this projects dashboard and view the canvas. Here should be able to drop in images or ctrl+v to paste in images. Pasting in text should create a new note.
When the timer runs out on an activity, present a button to allow +15 min and if not, ask for review of the activity block (click on a smiley) and immediately start the pause between activity blocks (should have smileys on top, and below a button like "or extend this activity"). At this point between activities is a good time to run either physical activity or spaced repetition. If no new cards to memorize and no old cards have reached review time yet, we do NOT suggest spaced repetition review in this pause.
After all of todays blocks are done (ie work day is over), spawn confetti on the screen and say congrats for finishing your day and see you again tomorrow.

An activity should consist of a projectId, activityId, activityName, userSuggestedDurationMins=30

A card should have fields front, back, mirrored, and optional field bottom if mirrored is true.

Data which needs to be logged for further studying:
Average work time per activity
Breakdown of activity end reasons by delta minutes (ie if suggested duration is 30 minutes but after only 15 minutes I click to end activity early then this needs to be recorded together with the duration completed and delta to the suggested). Possible reasons for activity ends:
- End activity early
- Activity timed out
- User left website (essentially we need to keep track of the current minutes of activity entered in memory for this and check if we have skipped a period when user re-enters website)
User lost focus by delta minutes should be saved in similar fashion to the activity end reasons, but obviously we can not compare these two since the user will come back to the activity after clicking on this button. But it provides valuable insight into how long we may want to keep the periods.
User remember cards probability and recall time. Would be interesting to investigate mental fatigue and if focus during periods and recall are connected.