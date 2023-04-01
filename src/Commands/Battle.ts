import { proto, delay } from '@adiwajshing/baileys'
import { PokemonMove, Pokemon } from '../../Database'
import { Command, BaseCommand, Message } from '../../Structures'
import { IArgs, IPokemonAPIResponse } from '../../Types'

@Command('battle', {
    description: 'Battle!',
    category: 'pokemon',
    usage: 'battle',
    cooldown: 5,
    exp: 20
})
export default class extends BaseCommand {
    override execute = async (M: Message, { context }: IArgs): Promise<void> => {
        const data = this.handler.pokemonBattleResponse.get(M.from)
        if (!data || !data.players.includes(M.sender.jid)) return void M.reply(`You aren't battling anyone here`)
        if (!context) return void M.reply('Invalid Usage!')
        const term = context.toLowerCase().trim().split(' ')[0].trim()
        switch (term) {
            default:
                return void M.reply('Invalid Usage')

            case 'fight':
                const cha = this.handler.pokemonBattleResponse.get(M.from)
                if (cha) {
                    const tUrn = M.sender.jid === cha[cha.turn].user
                    if (!tUrn) return void M.reply('Not your turn')
                    if (!M.numbers.length) {
                        let texT = `*Moves | ${this.client.utils.capitalize(cha[cha.turn].activePokemon.name)}*`
                        const rows: proto.Message.ListMessage.IRow[] = []
                        for (let i = 0; i < cha[cha.turn].activePokemon.moves.length; i++) {
                            rows.push({
                                title: `Use ${cha[cha.turn].activePokemon.moves[i].name
                                    .split('-')
                                    .map(this.client.utils.capitalize)
                                    .join(' ')}`,
                                rowId: `${this.client.config.prefix}battle fight ${i + 1}`,
                                description: `PP: ${cha[cha.turn].activePokemon.moves[i].pp} / ${
                                    cha[cha.turn].activePokemon.moves[i].maxPp
                                } | Type: ${this.client.utils.capitalize(
                                    cha[cha.turn].activePokemon.moves[i].type ?? 'Normal'
                                )} | Power: ${cha[cha.turn].activePokemon.moves[i].power} | Accuracy: ${
                                    cha[cha.turn].activePokemon.moves[i].power
                                }`
                            })
                            texT += `\n\n*#${i + 1}*\n❓ *Move:* ${cha[cha.turn].activePokemon.moves[i].name
                                .split('-')
                                .map(this.client.utils.capitalize)
                                .join(' ')}\n〽 *PP:* ${cha[cha.turn].activePokemon.moves[i].pp} / ${
                                cha[cha.turn].activePokemon.moves[i].maxPp
                            }\n🎗 *Type:* ${this.client.utils.capitalize(
                                cha[cha.turn].activePokemon.moves[i].type ?? 'Normal'
                            )}\n🎃 *Power:* ${cha[cha.turn].activePokemon.moves[i].power}\n🎐 *Accuracy:* ${
                                cha[cha.turn].activePokemon.moves[i].accuracy
                            }\n🧧 *Description:* ${cha[cha.turn].activePokemon.moves[i].description}`
                        }
                        const sections: proto.Message.ListMessage.ISection[] = [
                            {
                                title: 'Use Moves',
                                rows
                            }
                        ]
                        return void (await this.client.sendMessage(
                            M.from,
                            {
                                text: texT,
                                sections,
                                buttonText: 'Moves',
                                footer: ''
                            },
                            {
                                quoted: M.message
                            }
                        ))
                    }
                }
                const i = M.numbers[0] - 1
                const datA = this.handler.pokemonBattleResponse.get(M.from)
                if (datA) {
                    const pkmn = datA[datA.turn]
                    if (pkmn.activePokemon.hp <= 0)
                        return void M.reply("You can't fight with a fainted Pokemon. Switch to another Pokemon")
                    if (pkmn.activePokemon.moves[i].pp <= 0)
                        return void M.reply("You can't use this move now as it has run out of PP")
                    const move = pkmn.activePokemon.moves[i]
                    pkmn.move = move
                    pkmn.activePokemon.moves[i].pp -= 1
                    datA.turn = datA.turn === 'player1' ? 'player2' : 'player1'
                    this.handler.pokemonBattleResponse.set(M.from, datA)
                    const { party } = await this.client.DB.getUser(M.sender.jid)
                    const Index = party.findIndex((x) => x.tag === pkmn.activePokemon.tag)
                    party[Index].moves[i].pp -= 1
                    await this.client.DB.updateUser(M.sender.jid, 'party', 'set', party)
                    if (datA.turn === 'player2') return await this.continueSelection(M)
                    return await this.handleBattles(M)
                }
                return

            case 'forfeit':
                this.handler.pokemonBattlePlayerMap.delete(data.player2.user)
                this.handler.pokemonBattlePlayerMap.delete(data.player1.user)
                const user = data.player1.user === M.sender.jid ? data.player1.user : data.player2.user
                const winner = data.player1.user === M.sender.jid ? data.player2.user : data.player1.user
                const { wallet } = await this.client.DB.getUser(user)
                const amount = wallet > 5000 ? 4500 : wallet >= 250 ? 250 : wallet
                const gold = Math.floor(Math.random() * amount)
                await this.client.DB.setExp(winner, 450)
                await this.client.DB.setGold(winner, gold)
                await this.client.DB.setGold(user, -gold)
                this.handler.pokemonBattleResponse.delete(M.from)
                return void (await this.client.sendMessage(M.from, {
                    text: `🎉 Congrats! *@${winner.split('@')[0]}*, you won this battle and got *${gold}* gold from *@${
                        user.split('@')[0]
                    }* as he/she forfeitted themselves from this battle`,
                    mentions: [user, winner]
                }))

            case 'switch':
                const c = this.handler.pokemonBattleResponse.get(M.from)
                if (!c || !c.players.includes(M.sender.jid)) return void null
                const Turn = M.sender.jid === c[c.turn].user
                if (!Turn) return void M.reply('Not your turn')
                const index = M.numbers[0] - 1
                const { party: Party } = await this.client.DB.getUser(M.sender.jid)
                if (Party[index].hp <= 0) return void M.reply("You can't send out a fainted Pokemon to battle, Baka!")
                if (
                    Party[index].name === c[c.turn].activePokemon.name &&
                    Party[index].rejectedMoves.length === c[c.turn].activePokemon.rejectedMoves.length
                )
                    return void M.reply(
                        `*${this.client.utils.capitalize(c[c.turn].activePokemon.name)}* is already out here`
                    )
                const T = c.turn
                const Text = `*@${M.sender.jid.split('@')[0]}* ${
                    c[c.turn].activePokemon.hp > 0
                        ? `withdrew *${this.client.utils.capitalize(c[c.turn].activePokemon.name)}* from the battle and`
                        : ''
                } sent out *${this.client.utils.capitalize(Party[index].name)}* for the battle`
                if (c[c.turn].activePokemon.hp > 0) {
                    c.turn = c.turn === 'player1' ? 'player2' : 'player1'
                    c[T].move = 'skipped'
                } else c.turn = 'player1'
                c[T].activePokemon = Party[index]
                this.handler.pokemonBattleResponse.set(M.from, c)
                await this.client.sendMessage(M.from, {
                    mentions: [M.sender.jid],
                    text: Text
                })
                return await this.continueSelection(M)

            case 'pokemon':
                const ch = this.handler.pokemonBattleResponse.get(M.from)
                if (!ch) return void null
                const turn = M.sender.jid === ch[ch.turn].user
                if (!turn) return void M.reply('Not your turn')
                const { party } = await this.client.DB.getUser(M.sender.jid)
                const rows: proto.Message.ListMessage.IRow[] = []
                let text = ''
                for (let i = 0; i < party.length; i++) {
                    if (!party[i].types.length) {
                        const { types } = await this.client.utils.fetch<IPokemonAPIResponse>(
                            `https://pokeapi.co/api/v2/pokemon/${party[i].name}`
                        )
                        party[i].types = types.map((type) => type.type.name)
                        await this.client.DB.updateUser(M.sender.jid, 'party', 'set', party)
                    }
                    rows.push({
                        title: `${this.client.config.prefix}party ${i + 1}`,
                        rowId: `${this.client.config.prefix}battle switch ${i + 1}`,
                        description: `${this.client.utils.capitalize(party[i].name)} | HP: ${party[i].hp} / ${
                            party[i].maxHp
                        } | Level: ${party[i].level} | Type: ${this.client.utils.capitalize(party[i].types[0])}`
                    })
                    if (i > 0) text += '\n\n'
                    text += `*#${i + 1}*\n🟩 *Pokemon:* ${this.client.utils.capitalize(party[i].name)}\n🟨 *Level:* ${
                        party[i].level
                    }\n♻ *State:* ${
                        party[i].hp <= 0
                            ? 'Fainted'
                            : party[i].state.status === ''
                            ? 'Fine'
                            : this.client.utils.capitalize(party[i].state.status)
                    }\n🟢 *HP:* ${party[i].hp} / ${party[i].maxHp}\n🟧 *Types:* ${party[i].types
                        .map(this.client.utils.capitalize)
                        .join(', ')}`
                }
                const sections: proto.Message.ListMessage.ISection[] = [
                    {
                        title: `${M.sender.username}'s Party`,
                        rows
                    }
                ]
                return void (await M.reply(
                    text,
                    'text',
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    { sections, buttonText: 'Switch Pokemon' }
                ))
        }
    }

    private handleBattles = async (M: Message): Promise<void> => {
        const data = this.handler.pokemonBattleResponse.get(M.from)
        if (data) {
            const player1 = data.player1
            const player2 = data.player2
            const arr = [player1, player2]
            arr.sort((x, y) => y.activePokemon.speed - x.activePokemon.speed)
            if (arr[0].move !== 'skipped' && arr[1].move !== 'skipped' && arr[0].move !== '' && arr[1].move !== '')
                arr.sort((x, y) => (y.move as PokemonMove)['accuracy'] - (x.move as PokemonMove)['accuracy'])
            for (let i = 0; i < 2; i++) {
                if (arr[i].activePokemon.hp <= 0) continue
                const move = arr[i].move
                if (move === 'skipped') continue
                const res = move as PokemonMove
                let moveLanded = false
                if (res.accuracy === 100) moveLanded = true
                else {
                    const randomNum = Math.floor(Math.random() * 100)
                    if (res.accuracy >= randomNum) moveLanded = true
                }
                if (
                    (arr[i].activePokemon.state.status === 'sleeping' ||
                        arr[i].activePokemon.state.status === 'paralyzed') &&
                    arr[i].activePokemon.state.movesUsed > 0
                ) {
                    const trainer = arr[i].user === data.player1.user ? 'player1' : 'player2'
                    const { party } = await this.client.DB.getUser(data[trainer].user)
                    data[trainer].activePokemon.state.movesUsed -= 1
                    if (data[trainer].activePokemon.state.movesUsed < 1) {
                        await this.client.sendMessage(M.from, {
                            mentions: [data[trainer].user],
                            text: `*@${data[trainer].user.split('@')[0]}*'s *${this.client.utils.capitalize(
                                data[trainer].activePokemon.name
                            )}* is ${
                                data[trainer].activePokemon.state.status === 'sleeping'
                                    ? 'awake now'
                                    : 'free from paralysis now'
                            }`
                        })
                        await delay(3000)

                        data[trainer].activePokemon.state.status = ''
                        this.handler.pokemonBattleResponse.set(M.from, data)
                        const i = party.findIndex((x) => x.tag === data[trainer].activePokemon.tag)
                        party[i] = data[trainer].activePokemon
                        await this.client.DB.updateUser(data[trainer].user, 'party', 'set', party)
                    } else {
                        if (data[trainer].activePokemon.state.status === 'sleeping') {
                            await this.client.sendMessage(M.from, {
                                mentions: [data[trainer].user],
                                text: `*@${data[trainer].user.split('@')[0]}*'s *${this.client.utils.capitalize(
                                    data[trainer].activePokemon.name
                                )}* is fast asleep`
                            })
                            await delay(3000)
                            this.handler.pokemonBattleResponse.set(M.from, data)
                            continue
                        } else {
                            const c = Math.floor(Math.random() * 100)
                            if (c > 25) {
                                await this.client.sendMessage(M.from, {
                                    mentions: [data[trainer].user],
                                    text: `*@${data[trainer].user.split('@')[0]}*'s *${this.client.utils.capitalize(
                                        data[trainer].activePokemon.name
                                    )}* can't move as its paralyzed`
                                })
                                await delay(3000)

                                this.handler.pokemonBattleResponse.set(M.from, data)
                                continue
                            }
                        }
                    }
                }
                await this.client.sendMessage(M.from, {
                    text: `*@${arr[i].user.split('@')[0]}*'s *${this.client.utils.capitalize(
                        arr[i].activePokemon.name
                    )}* used *${(arr[i].move as PokemonMove).name
                        .split('-')
                        .map(this.client.utils.capitalize)
                        .join(' ')}* at *${this.client.utils.capitalize(arr[i === 0 ? 1 : 0].activePokemon.name)}*`,
                    mentions: [arr[i].user]
                })
                await delay(5000)
                if (moveLanded) {
                    const data1 = arr[i]
                    const data2 = arr[i === 0 ? 1 : 0]
                    const pokemon = data1.activePokemon
                    const pkmn = data2.activePokemon
                    const move = data1.move as PokemonMove
                    const { party } = await this.client.DB.getUser(data1.user)
                    const { party: Party } = await this.client.DB.getUser(data2.user)
                    const i1 = party.findIndex((x) => x.tag === pokemon.tag)
                    const i2 = Party.findIndex((x) => x.tag === pkmn.tag)
                    if (move.stat_change.length && move.power <= 0) {
                        for (const { target, change } of move.stat_change) {
                            let text = `Due to the usage of *${move.name
                                .split('-')
                                .map(this.client.utils.capitalize)
                                .join(' ')}* by *@${
                                data1.user.split('@')[0]
                            }*'s Pokemon *${this.client.utils.capitalize(pokemon.name)}*,`
                            if (change < 0) {
                                text += ` the *${target.toUpperCase()}* of *@${
                                    data2.user.split('@')[0]
                                }*'s Pokemon *${this.client.utils.capitalize(pkmn.name)}* fell by ${change
                                    .toString()
                                    .replace('-', '')}`
                                await this.client.sendMessage(M.from, {
                                    text,
                                    mentions: [data2.user, data1.user]
                                })
                                await delay(3000)
                                pkmn[target as 'attack'] += change
                            } else {
                                text += `the *${target.toUpperCase()}* of itself rose by ${change}`
                                await this.client.sendMessage(M.from, {
                                    text,
                                    mentions: [data1.user]
                                })
                                pokemon[target as 'attack'] += change
                            }
                            party[i1] = pokemon
                            Party[i2] = pkmn
                            await this.client.DB.updateUser(data1.user, 'party', 'set', party)
                            await this.client.DB.updateUser(data2.user, 'party', 'set', Party)
                            this.handler.pokemonBattleResponse.set(M.from, data)
                        }
                        if (move.power <= 0) continue
                    }
                    if (move.drain > 0 || move.healing > 0) {
                        let flag = false
                        if (move.drain > 0) flag = true
                        if (flag) {
                            let drain = pkmn.hp >= move.drain ? move.drain : pkmn.hp
                            if (pokemon.maxHp < pokemon.hp + drain) drain = pokemon.maxHp - pokemon.hp
                            pkmn.hp -= drain
                            pokemon.hp += drain
                            await this.client.sendMessage(M.from, {
                                text: `*@${data1.user.split('@')[0]}*'s *${this.client.utils.capitalize(
                                    pokemon.name
                                )}* drained and restored *${drain} HP* from *@${
                                    data2.user.split('@')[0]
                                }*'s ${this.client.utils.capitalize(pkmn.name)}*`,
                                mentions: [data1.user, data2.user]
                            })
                            await delay(3000)

                            party[i1] = pokemon
                            Party[i2] = pkmn
                            this.handler.pokemonBattleResponse.set(M.from, data)
                            await this.client.DB.updateUser(data1.user, 'party', 'set', party)
                            await this.client.DB.updateUser(data2.user, 'party', 'set', Party)
                        } else {
                            const heal =
                                move.healing + pokemon.hp > pokemon.maxHp ? pokemon.maxHp - pokemon.hp : move.healing
                            pokemon.hp += heal
                            await this.client.sendMessage(M.from, {
                                text: `*@${data1.user.split('@')[0]}*'s *${this.client.utils.capitalize(
                                    pokemon.name
                                )}* restored *${heal} HP*`,
                                mentions: [data1.user, data2.user]
                            })
                            await delay(3000)

                            party[i1] = pokemon
                            this.handler.pokemonBattleResponse.set(M.from, data)
                            await this.client.DB.updateUser(data1.user, 'party', 'set', party)
                        }
                    }
                    if (['sleep', 'paralysis', 'poison'].includes(move.effect)) {
                        let exist = false
                        const status = pkmn.state.status
                        if (status === move.effect) exist = true
                        if (exist) {
                            await this.client.sendMessage(M.from, {
                                text: `*@${data2.user.split('@')[0]}*'s *${this.client.utils.capitalize(
                                    pkmn.name
                                )}* is already ${
                                    move.effect === 'poison'
                                        ? 'Poisoned'
                                        : move.effect === 'sleep'
                                        ? 'Sleeping'
                                        : 'Paralyzed'
                                }`,
                                mentions: [data2.user]
                            })
                            await delay(5000)
                        } else {
                            pkmn.state.status =
                                move.effect === 'sleep'
                                    ? 'sleeping'
                                    : move.effect === 'poison'
                                    ? 'poisoned'
                                    : 'paralyzed'
                            pkmn.state.movesUsed = 5
                            Party[i2] = pkmn
                            this.handler.pokemonBattleResponse.set(M.from, data)
                            await this.client.DB.updateUser(data2.user, 'party', 'set', Party)
                        }
                    }
                    const attack = pokemon.attack
                    const defense = pkmn.defense
                    const weakness: string[] = []
                    const strong: string[] = []
                    for (const type of pkmn.types) {
                        const data = await this.client.utils.fetch<{ weakness: string[]; strong: string[] }>(
                            `https://shooting-star-unique-api.vercel.app/api/mwl/type?type=${type}`
                        )
                        for (const w of data.weakness) weakness.push(w)
                        for (const s of data.strong) strong.push(s)
                    }
                    let effect = ((attack - defense) / 50) * move.power + Math.floor(Math.random() * 25)
                    let k = ''
                    if (weakness.includes(move.type)) k = 's'
                    if (strong.includes(move.type)) k = 'w'
                    if (pkmn.types.includes(move.type)) k = 'w'
                    if (move.type === 'normal') k = ''
                    if (k === 'w') effect = Math.floor(Math.random() * effect)
                    if (k === 's') effect = effect * 2
                    const calcDamage = Math.floor(Math.round((move.power + effect) / 2.5))
                    const result = calcDamage > 5 ? calcDamage : 5
                    if (k === 'w' || k === 's') await M.reply(`It's ${k === 'w' ? 'not' : 'super'} effective`)
                    pkmn.hp -= result
                    this.handler.pokemonBattleResponse.set(M.from, data)
                    await this.client.sendMessage(M.from, {
                        text: `*@${data1.user.split('@')[0]}*'s *${this.client.utils.capitalize(
                            pokemon.name
                        )}* dealt a damage of *${result}* to *@${
                            data2.user.split('@')[0]
                        }*'s *${this.client.utils.capitalize(pkmn.name)}*`,
                        mentions: [data1.user, data2.user]
                    })
                    await delay(3000)
                    party[i1] = pokemon
                    Party[i2] = pkmn
                    await this.client.DB.updateUser(data1.user, 'party', 'set', party)
                    await this.client.DB.updateUser(data2.user, 'party', 'set', Party)
                    if (pkmn.hp <= 0) {
                        pkmn.hp = 0
                        await this.client.sendMessage(M.from, {
                            text: `*@${data2.user.split('@')[0]}*'s *${this.client.utils.capitalize(
                                pkmn.name
                            )}* fainted`,
                            mentions: [data2.user]
                        })
                        await delay(5000)
                        Party[i2] = pkmn
                        data.turn = i === 0 ? 'player2' : 'player1'
                        await this.client.DB.updateUser(data2.user, 'party', 'set', Party)
                        this.handler.pokemonBattleResponse.set(M.from, data)
                        if (pokemon.level < 100)
                            await this.handleStats(
                                M,
                                pkmn.exp,
                                data1.user,
                                pokemon,
                                data2.user === data.player1.user ? 'player2' : 'player1'
                            )
                    }
                } else {
                    await this.client.sendMessage(M.from, {
                        text: `*@${arr[i].user.split('@')[0]}*'s *${this.client.utils.capitalize(
                            arr[i].activePokemon.name
                        )}* missed the attack`,
                        mentions: [arr[i].user]
                    })
                }
            }
            return await this.continueSelection(M)
        }
    }

    private continueSelection = async (M: Message): Promise<void> => {
        const data = this.handler.pokemonBattleResponse.get(M.from)
        if (data) {
            const { party } = await this.client.DB.getUser(data.player1.user)
            const { party: Party } = await this.client.DB.getUser(data.player2.user)
            const image = await this.client.utils.drawPokemonBattle({
                player1: { activePokemon: data.player1.activePokemon, party },
                player2: { activePokemon: data.player2.activePokemon, party: Party }
            })
            const user = data[data.turn].activePokemon
            const p = data.turn === 'player1' ? 'player2' : 'player1'
            const User = data[p].activePokemon
            if (user.state.status === 'poisoned' && user.hp > 0) {
                const f = Math.floor(Math.random() * user.hp)
                user.hp -= f
                await this.client.sendMessage(M.from, {
                    text: `*@${data[data.turn].user.split('@')[0]}*'s *${this.client.utils.capitalize(
                        user.name
                    )}* drained *${f} HP* for getting poisoned`,
                    mentions: [data[data.turn].user]
                })
                this.handler.pokemonBattleResponse.set(M.from, data)
                const Data = await this.client.DB.getUser(data[data.turn].user)
                const i = Data.party.findIndex((x) => x.tag === user.tag)
                Data.party[i] = user
                await this.client.DB.updateUser(data[data.turn].user, 'party', 'set', Data.party)
            }
            if (User.state.status === 'poisoned' && User.hp > 0) {
                const f = Math.floor(Math.random() * User.hp)
                user.hp -= f
                await this.client.sendMessage(M.from, {
                    text: `*@${data[p].user.split('@')[0]}*'s *${this.client.utils.capitalize(
                        User.name
                    )}* drained *${f} HP* for getting poisoned`,
                    mentions: [data[p].user]
                })
                this.handler.pokemonBattleResponse.set(M.from, data)
                const Data = await this.client.DB.getUser(data[p].user)
                const i = Data.party.findIndex((x) => x.tag === User.tag)
                Data.party[i] = User
                await this.client.DB.updateUser(data[p].user, 'party', 'set', Data.party)
            }
            if (data.turn !== 'player2')
                await this.client.sendMessage(M.from, {
                    image,
                    jpegThumbnail: image.toString('base64')
                })
            if (user.hp <= 0) {
                const Data = await this.client.DB.getUser(data[data.turn].user)
                Data.party = Data.party.filter((a) => a.hp > 0)
                if (!Data.party.length)
                    return await this.endBattle(
                        M,
                        data[data.turn === 'player1' ? 'player2' : 'player1'].user,
                        data[data.turn].user
                    )
                await this.client.sendMessage(M.from, {
                    text: `*@${
                        data[data.turn].user.split('@')[0]
                    }* send out one of a Pokemon in your party by selecting the list sent`,
                    mentions: [data[data.turn].user]
                })
                const jid = M.sender.jid
                M.sender.jid = data[data.turn].user
                await this.execute(M, { context: 'pokemon', flags: [], args: [] })
                M.sender.jid = jid
                return
            }
            if (User.hp <= 0) {
                const Data = await this.client.DB.getUser(data[p].user)
                Data.party = Data.party.filter((a) => a.hp > 0)
                if (!Data.party.length) return await this.endBattle(M, data[data.turn].user, data[p].user)
                await this.client.sendMessage(M.from, {
                    text: `*@${
                        data[p].user.split('@')[0]
                    }* send out one of a Pokemon in your party by selecting the list sent`,
                    mentions: [data[p].user]
                })
                data.turn = p
                this.handler.pokemonBattleResponse.set(M.from, data)
                const jid = M.sender.jid
                M.sender.jid = data[p].user
                await this.execute(M, { context: 'pokemon', flags: [], args: [] })
                M.sender.jid = jid
                return
            }
            const player = data[data.turn]
            const rows: proto.Message.ListMessage.IRow[] = []
            const options = ['Fight', 'Pokemon', 'Forfeit']
            for (let i = 0; i < 3; i++) {
                rows.push({
                    title: options[i],
                    rowId: `${this.client.config.prefix}battle ${options[i].toLowerCase()}`
                })
            }
            const sections: proto.Message.ListMessage.ISection[] = [
                {
                    title: 'Options',
                    rows
                }
            ]
            return void (await this.client.sendMessage(M.from, {
                text: `Select one of the rows given below\n*@${player.user.split('@')[0]}*`,
                sections,
                buttonText: 'Battle Options',
                footer: '',
                mentions: [player.user]
            }))
        }
    }

    private endBattle = async (M: Message, winner: string, loser: string): Promise<void> => {
        const data = this.handler.pokemonBattleResponse.get(M.from)
        if (data) {
            const image = await this.client.utils.drawPokemonBattle({
                player1: {
                    activePokemon: data.player1.activePokemon,
                    party: (await this.client.DB.getUser(data.player1.user)).party
                },
                player2: {
                    activePokemon: data.player2.activePokemon,
                    party: (await this.client.DB.getUser(data.player2.user)).party
                }
            })
            await this.client.sendMessage(M.from, {
                image,
                jpegThumbnail: image.toString('base64')
            })
            await delay(3000)
            await this.client.sendMessage(M.from, {
                text: `*@${loser.split('@')[0]}* ran out of Pokemon for battle`,
                mentions: [loser]
            })
            setTimeout(async () => {
                const { wallet } = await this.client.DB.getUser(loser)
                const amount = wallet > 5000 ? 4500 : wallet >= 250 ? 250 : wallet
                const gold = Math.floor(Math.random() * amount)
                await this.client.DB.setExp(winner, 450)
                await this.client.DB.setGold(winner, gold)
                await this.client.DB.setGold(loser, -gold)
                this.handler.pokemonBattleResponse.delete(M.from)
                this.handler.pokemonBattlePlayerMap.delete(loser)
                this.handler.pokemonBattlePlayerMap.delete(winner)
                return void (await this.client.sendMessage(M.from, {
                    text: `🎉 Congrats! *@${winner.split('@')[0]}*, you won this battle and got *${gold}* gold from *@${
                        loser.split('@')[0]
                    }* as he/she ran out of Pokemon for battle`,
                    mentions: [loser, winner]
                }))
            }, 5000)
        }
    }

    private handleStats = async (
        M: Message,
        exp: number,
        user: string,
        pkmn: Pokemon,
        player: 'player1' | 'player2'
    ): Promise<void> => {
        const resultExp = Math.round(exp / 5)
        await this.client.sendMessage(M.from, {
            text: `*@${user.split('@')[0]}*'s *${this.client.utils.capitalize(pkmn.name)}* gained *${resultExp} XP*`,
            mentions: [user]
        })
        await delay(3000)
        pkmn.exp += resultExp
        pkmn.displayExp += resultExp
        const pokemonLevelCharts = await this.client.utils.fetch<{ level: number; expRequired: number }[]>(
            'https://shooting-star-unique-api.vercel.app/api/mwl/levels'
        )
        const levels = pokemonLevelCharts.filter((x) => pkmn.exp >= x.expRequired)
        if (pkmn.level < levels[levels.length - 1].level) {
            pkmn.level = levels[levels.length - 1].level
            pkmn.displayExp = pkmn.exp - levels[levels.length - 1].expRequired
            this.client.emit('pokemon_levelled_up', { M, pokemon: pkmn, inBattle: true, player, user })
        }
        const data = this.handler.pokemonBattleResponse.get(M.from)
        if (data && data[player].activePokemon.tag === pkmn.tag) {
            data[player].activePokemon = pkmn
            this.handler.pokemonBattleResponse.set(M.from, data)
        }
        const { party } = await this.client.DB.getUser(user)
        const i = party.findIndex((x) => x.tag === pkmn.tag)
        party[i] = pkmn
        await this.client.DB.updateUser(user, 'party', 'set', party)
    }
}
