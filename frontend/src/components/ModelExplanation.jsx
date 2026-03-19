export default function ModelExplanation() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 leading-relaxed">
      <div>
        <h2 className="font-display text-2xl text-brand-ink mb-2" style={{ fontWeight: 600 }}>How the model works</h2>
        <p className="text-brand-muted text-sm">
          A walkthrough of each component, how it earns its slice of the composite score,
          and where the model's blind spots are.
        </p>
      </div>

      <Section title="UCL Phase Score (57%)">
        <p>
          The UCL phase gets the largest share because it is the closest thing we have to a
          controlled experiment. Every team in the round of 16 has played eight to ten games
          against the best clubs in Europe, under knockout pressure, in the exact competition
          we're trying to predict. Eight to ten competitive European games is a meaningful sample.
        </p>
        <p className="mt-3">
          When Arsenal keep a clean sheet against Monaco at the Emirates or PSG dismantle
          Atletico over two legs, those results tell us something specific about how these
          teams perform in European knockout football. Far more than a run of Premier League
          wins against mid-table opposition.
        </p>
        <p className="mt-3">
          Within the UCL block, defence gets 36% and attack gets 28%. That asymmetry is not
          arbitrary. Twelve of the last fifteen Champions League winners ranked in the top five
          for xGA in the competition. Two-legged ties are structurally different from league
          football. A team that keeps it tight away from home, even scraping a 0-0 or a 1-1,
          arrives at the second leg with options. A team that concedes two away goals is suddenly
          chasing. The marginal value of preventing a goal is higher than the marginal value of
          scoring one, because conceding away goals changes the entire tie dynamic. Atletico
          Madrid have built a dynasty on this logic.
        </p>
      </Section>

      <Section title="QAWR: Quality-Adjusted Win Rate">
        <p>
          Raw win percentage tells you very little in this context. A team that won six of eight
          games against Qarabag, Red Star, and Shakhtar is not better than a team that won four
          of eight against Bayern, Arsenal, and Real Madrid. QAWR weights every result by the
          opponent's UEFA coefficient relative to the competition mean. Beat a team rated 120
          when the average is 93, and that win counts for more. Draw with a 60-rated team when
          you needed a win? That hurts.
        </p>
        <p className="mt-3">
          Two additional adjustments cover what the raw number misses. First, recency: the last
          four games in the UCL phase get a 1.2x multiplier, the first four get 0.8x. A team that
          peaked in January and faded in February is less dangerous than one building form right
          now. Second, playoff games get a 1.3x multiplier because knockout football is a
          fundamentally different test of nerve and organisation. PSG navigating a tight tie
          against Liverpool tells you something a comfortable 4-0 over a group-stage minnow
          cannot.
        </p>
      </Section>

      <Section title="Domestic Form (25%)">
        <p>
          Some people ask why we include league data at all when predicting a European cup.
          The answer is the law of large numbers. Eight UCL games is a thin sample. Enough to
          be informative, not enough to be definitive. Thirty league games is not thin. By the
          time we reach the knockout rounds, a team's domestic xG, xGA, and xPts are among the
          most reliable estimates of their true quality available. Random variance has been
          largely washed out.
        </p>
        <p className="mt-3">
          The catch is that a Bayern xG in the Bundesliga isn't worth the same as an Arsenal
          xG in the Premier League. A league strength multiplier derived from UEFA association
          coefficients corrects for this. England sits at 1.0, Spain at 0.806, Germany at 0.794,
          and so on. This doesn't perfectly equalise everything, but it prevents a team from
          getting artificially inflated scores just because they dominate a weaker league.
          Barcelona's domestic numbers are outstanding. The multiplier ensures we compare them
          fairly to Arsenal's numbers from a harder environment.
        </p>
      </Section>

      <Section title="Strength of Schedule (8%)">
        <p>
          This component earns a modest slice for a specific reason. Two teams can have
          identical QAWRs and yet one faced Bayern, Real Madrid, and Arsenal while the other
          faced Slavia Praha, Qarabag, and Red Star Belgrade. The first team's record means more.
          SOS exists to capture that residual signal after QAWR has done its job.
        </p>
        <p className="mt-3">
          We cap it at 8% because SOS and QAWR are naturally correlated. Teams that play harder
          schedules tend to have lower QAWRs, which the model already rewards. Giving SOS too
          much weight would double-count the same information and punish teams who happened to
          draw difficult groups. Eight percent is enough to reward Newcastle for their brutal
          draw without distorting everything else.
        </p>
      </Section>

      <Section title="KO History (7%)">
        <p>
          This is the most philosophically interesting component. We're asking whether a team's
          five-year knockout record in this exact competition tells us something beyond their
          current-season numbers. Based on the backtest, the answer is yes, but only a little,
          which is why it gets 7%.
        </p>
        <p className="mt-3">
          Real Madrid winning 11 knockout ties out of 14 played across five UCL campaigns is
          not luck. Neither is PSG winning the 2025 final 5-0 after finishing 15th in the league
          phase. There is a real but hard to quantify quality. Call it knockout mentality, squad
          experience under pressure, the ability to read a tie and manage it. That quality is
          something statistical models of current form tend to underweight.
        </p>
        <p className="mt-3">
          The five-year window smooths out single-season noise while still being recent enough
          to reflect current squads. Small bonuses for finals appearances and titles acknowledge
          that getting to finals is itself a repeatable skill.
        </p>
      </Section>

      <Section title="UEFA Coefficient (3%)">
        <p>
          This is a tiebreaker, nothing more. Three percent is small enough that it cannot
          meaningfully distort a ranking. It can only break near-dead heats. What it represents
          is accumulated European pedigree over five seasons: the structural depth, scouting, and
          continental experience that shows up year after year. Real Madrid at 100/100 and Arsenal
          at 57.8/100 reflects a genuine historical gap in European infrastructure that hasn't
          been fully closed yet. That gap is worth acknowledging, but not overstating.
        </p>
      </Section>

      <Section title="The KO Bonus, Additive and Scaled">
        <p>
          After computing the composite and mapping it to an ELO, a final additive adjustment
          is applied. This is the most opinionated part of the model, and deliberately so. The
          composite measures quality in aggregate. But some teams have done things in this
          competition's recent history that no phase stat can capture. PSG winning the 2025 final
          by five goals. Bayern's consistent late-round performances. Sporting's tendency to
          underperform their ELO in knockout football. These adjustments are research-based but
          subjective by design. They represent our best judgement about what the numbers miss.
        </p>
        <p className="mt-3">
          The scaling mechanism matters. A dampener equal to composite divided by 200 is applied,
          meaning stronger teams get more amplification from positive records and weaker cushioning
          from negative ones. This mirrors how knockout football actually works. Quality teams
          convert momentum into results more efficiently than weaker teams do. A high-ELO team
          with a great knockout record is more dangerous than the sum of the two parts.
        </p>
      </Section>

      <Section title="What the model gets wrong">
        <p>
          The Poisson goal model used in Monte Carlo assumes each team's scoring rate is fixed
          by their ELO. It doesn't account for tactical matchup effects, managerial in-game
          adjustments, or the chaotic nature of individual knockout moments.
        </p>
        <p className="mt-3">
          The 66% accuracy on the five-year backtest is genuinely good relative to betting
          markets (57%) and FiveThirtyEight (54%). But it still means the model is wrong one
          time in three. Use it as one signal among several, not as a definitive answer. The
          best forecast is one that combines systematic models like this with market prices,
          recent news, and your own assessment of things numbers cannot see.
        </p>
      </Section>

      <Section title="Agent Swarm" titleStyle={{ fontSize: 20 }}>
        <p>
          The swarm is built on the same principles as MiroFish, an open source swarm intelligence
          engine that spawns thousands of autonomous AI agents to simulate collective human
          behaviour before an event happens. Rather than asking one model for a probability,
          MiroFish creates a parallel digital world where agents with different memories,
          personalities and biases interact until a consensus emerges from the bottom up.
          The approach treats prediction as a social process rather than a calculation. What
          the crowd believes, argues about, and eventually agrees on tends to carry information
          that no single model captures.
        </p>
        <p className="mt-3">
          The goal here is to approximate what a prediction market would look like if every
          participant had a distinct and fully articulated view rather than just a price. Kalshi
          and Polymarket aggregate beliefs through money. This swarm aggregates them through
          argument. The final consensus probabilities are the closest thing to a crowd forecast
          the model can produce without actual market liquidity behind them.
        </p>
        <p className="mt-3">
          There are 111 agents. Each one has a name, an age, an occupation, a nationality, a
          football background, and a declared methodology bias. Some are data analysts who trust
          only numbers. Some are historians who weight pedigree above current form. Some are fans
          of specific clubs who start from a position of belief and update reluctantly. Some are
          contrarians who fade whoever the consensus lands on. There is a bandwagon agent who
          reflects the crowd rather than shaping it. There is a highlight chaser who thinks in
          terms of moments and drama. The diversity is the point. A room of identical analysts
          produces a number. A room of genuinely different people produces a debate.
        </p>

        <div className="mt-6 space-y-6">
          <div>
            <h4 className="font-display text-brand-ink mb-2" style={{ fontSize: 16, fontWeight: 600 }}>Round 1</h4>
            <p>
              Each agent reads the seed material independently and forms a view without knowing
              what anyone else thinks. The distribution reflects 111 separate starting positions
              across different methodologies, biases, club allegiances and professional backgrounds.
              A data analyst and a lifelong fan reading the same information will arrive at very
              different places.
            </p>
          </div>

          <div>
            <h4 className="font-display text-brand-ink mb-2" style={{ fontSize: 16, fontWeight: 600 }}>Round 2</h4>
            <p>
              Agents break into smaller clusters of roughly ten people before any whole-group
              discussion happens. Within each cluster the conversation is intense and specific.
              A cluster containing a Madridista superfan, a contrarian analyst and a Bayesian
              forecaster will produce a very different local consensus to one containing three
              data scientists and two market followers. High-influence agents pull their cluster
              toward them. Introverts hold position unless the argument is sustained across most
              of the cluster. Contrarians move away from whatever their cluster majority lands on.
              The cluster dynamic is where most of the meaningful belief updating happens because
              the disagreements are direct and personal rather than broadcast to a room.
            </p>
          </div>

          <div>
            <h4 className="font-display text-brand-ink mb-2" style={{ fontSize: 16, fontWeight: 600 }}>Round 3</h4>
            <p>
              The full group sees the aggregated output from all round 2 clusters simultaneously.
              This is where herd behaviour emerges. Agents who were on the fence in round 2 tend
              to move toward the emerging consensus. The stubborn ones dig in harder against it.
              Contrarian agents who were already moving away from their cluster majority now have
              a larger target to push against. The bandwagon agent reflects wherever the weight
              of the room has settled. The final consensus probability is the
              confidence-weighted average of all 111 positions after this full group convergence,
              which is why it tends to be more decisive than the round 2 distribution.
            </p>
          </div>
        </div>

        <p className="mt-6">
          The Monte Carlo simulation is precise but it only knows what the numbers say. The
          swarm adds context the numbers cannot carry. An agent who knows Arbeloa lost to a
          second-tier Spanish side three weeks ago weights that differently to the ELO model
          which has no record of it. Two agents watching the same match will draw opposite
          conclusions depending on which details they weight most heavily.
          The gap between the Monte Carlo output and the swarm consensus is where the most
          interesting information lives. When they agree, the signal is strong. When they
          diverge significantly, something worth investigating is usually the reason.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children, titleStyle }) {
  return (
    <section>
      <h3 className="font-display text-base text-brand-ink mb-3 pb-2 border-b border-brand-border"
          style={{ fontWeight: 600, ...titleStyle }}>
        {title}
      </h3>
      <div className="font-display text-brand-navy text-[0.9375rem]" style={{ fontWeight: 400 }}>{children}</div>
    </section>
  )
}
