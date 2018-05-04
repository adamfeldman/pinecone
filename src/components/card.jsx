import React from 'react'
import PropTypes from 'prop-types'
import { DraggableCore } from 'react-draggable'
import classNames from 'classnames'
import Debug from 'debug'

import InlineEditor from './inline-editor'
import Loop from '../loop'
import * as Model from '../model'

const log = Debug('pushpin:card')

class Card extends React.PureComponent {
  constructor(props) {
    super(props)
    log('constructor')
    this.state = {
      moving: false,
      resizing: false,
      moveX: null,
      moveY: null,
      slackX: null,
      slackY: null,
      resizeWidth: null,
      resizeHeight: null,
      slackWidth: null,
      slackHeight: null,
      totalDrag: null,
      loading: false,
      imagePath: null
    }

    this.onStart = this.onStart.bind(this)
    this.onDrag = this.onDrag.bind(this)
    this.onStop = this.onStop.bind(this)
    this.onLocalHeight = this.onLocalHeight.bind(this)
  }

  componentDidMount() {
    if (this.props.card.type === 'image') {
      this.setState({ loading: true }, () => {
        Model.fetchImage(this.props.card.hyperfile, (error, imagePath) => {
          if (error) {
            log(error)
          }

          this.setState({ loading: false, imagePath: `../${imagePath}` })
        })
      })
    }
  }

  componentWillReceiveProps(props) {
    log('componentWillReceiveProps')
  }

  onStart(e, d) {
    log('onStart')

    if (d.deltaX !== 0 || d.deltaY !== 0) {
      throw new Error('Did not expect delta in onStart')
    }

    const clickX = d.lastX
    const clickY = d.lastY
    const card = this.props.card
    const resizing = ((clickX >= (card.x + card.width - Model.RESIZE_HANDLE_SIZE)) &&
                      (clickX <= (card.x + card.width)) &&
                      (clickY >= (card.y + card.height - Model.RESIZE_HANDLE_SIZE)) &&
                      (clickY <= (card.y + card.height)))

    const updates = {}
    updates.resizing = resizing
    updates.moving = !resizing
    updates.totalDrag = 0

    if (updates.moving) {
      updates.moveX = card.x
      updates.moveY = card.y
      updates.slackX = 0
      updates.slackY = 0
    }

    if (updates.resizing) {
      updates.resizeWidth = card.width
      updates.resizeHeight = card.height
      updates.slackWidth = 0
      updates.slackHeight = 0
    }

    this.setState(updates)
  }

  onDrag(e, d) {
    log('onDrag')

    if (!this.state.resizing && !this.state.moving) {
      throw new Error('Did not expect drag without resize or move')
    }
    if (this.state.resizing && this.state.moving) {
      throw new Error('Did not expect drag with both resize and move')
    }

    const deltaX = d.deltaX
    const deltaY = d.deltaY
    if ((deltaX === 0) && (deltaY === 0)) {
      return
    }

    const card = this.props.card
    const updates = {}

    if (this.state.moving) {
      // First guess at change in location given mouse movements.
      const preClampX = this.state.moveX + deltaX
      const preClampY = this.state.moveY + deltaY

      // Add slack to the values used to calculate bound position. This will
      // ensure that if we start removing slack, the element won't react to
      // it right away until it's been completely removed.
      let newX = preClampX + this.state.slackX
      let newY = preClampY + this.state.slackY

      // Clamp to ensure card doesn't move beyond the board.
      newX = Math.max(newX, 0)
      newX = Math.min(newX, Model.BOARD_WIDTH - card.width)
      newY = Math.max(newY, 0)
      newY = Math.min(newY, Model.BOARD_HEIGHT - card.height)

      // If the numbers changed, we must have introduced some slack.
      // Record it for the next iteration.
      const newSlackWidth = this.state.slackX + preClampX - newX
      const newSlackHeight = this.state.slackY + preClampY - newY

      updates.moveX = newX
      updates.moveY = newY
      updates.slackX = newSlackWidth
      updates.slackY = newSlackHeight
    }

    if (this.state.resizing) {
      // First guess at change in dimensions given mouse movements.
      let preClampWidth = this.state.resizeWidth + deltaX
      let preClampHeight = this.state.resizeHeight + deltaY

      // Maintain aspect ratio on image cards.
      if (card.type !== 'text') {
        const ratio = this.state.resizeWidth / this.state.resizeHeight
        preClampHeight = preClampWidth / ratio
        preClampWidth = preClampHeight * ratio
      }

      // Add slack to the values used to calculate bound position. This will
      // ensure that if we start removing slack, the element won't react to
      // it right away until it's been completely removed.
      let newWidth = preClampWidth + this.state.slackWidth
      let newHeight = preClampHeight + this.state.slackHeight

      // Clamp to ensure card doesn't resize beyond the board or min dimensions.
      newWidth = Math.max(Model.CARD_MIN_WIDTH, newWidth)
      newWidth = Math.min(Model.BOARD_WIDTH - card.x, newWidth)
      newHeight = Math.max(Model.CARD_MIN_HEIGHT, newHeight)
      newHeight = Math.min(Model.BOARD_HEIGHT - card.y, newHeight)

      // If the numbers changed, we must have introduced some slack.
      // Record it for the next iteration.
      const newSlackWidth = this.state.slackWidth + preClampWidth - newWidth
      const newSlackHeight = this.state.slackHeight + preClampHeight - newHeight

      updates.resizeWidth = newWidth
      updates.resizeHeight = newHeight
      updates.slackWidth = newSlackWidth
      updates.slackHeight = newSlackHeight
    }

    updates.totalDrag = this.state.totalDrag + Math.abs(deltaX) + Math.abs(deltaY)

    this.setState(updates)
  }

  onStop(e, d) {
    log('onStop')

    if (d.deltaX !== 0 || d.deltaY !== 0) {
      throw new Error('Did not expect delta in onStart')
    }

    const card = this.props.card
    const minDragSelection = this.state.totalDrag < Model.GRID_SIZE / 2

    if (!this.props.selected && minDragSelection) {
      Loop.dispatch(Model.cardUniquelySelected, { id: this.props.card.id })
    }

    const updates = {}

    if (this.state.moving) {
      const snapX = Model.snapToGrid(this.state.moveX)
      const snapY = Model.snapToGrid(this.state.moveY)
      Loop.dispatch(Model.cardMoved, { id: card.id, x: snapX, y: snapY })
      updates.moveX = null
      updates.moveY = null
      updates.slackX = null
      updates.slackY = null
    } else if (this.state.resizing) {
      const snapWidth = Model.snapToGrid(this.state.resizeWidth)
      const snapHeight = Model.snapToGrid(this.state.resizeHeight)
      Loop.dispatch(Model.cardResized, { id: card.id, width: snapWidth, height: snapHeight })
      updates.resizeWidth = null
      updates.resizeHeight = null
      updates.slackWidth = null
      updates.slackHeight = null
    }

    updates.resizing = false
    updates.moving = false
    updates.totalDrag = null

    this.setState(updates)
  }

  onLocalHeight(resizeHeight) {
    log('onLocalheight', resizeHeight)
    this.setState({ resizeHeight })
  }

  render() {
    log('render')

    const card = this.props.card
    const style = {
      width: this.state.resizeWidth || card.width,
      height: this.state.resizeHeight || card.height,
      position: 'absolute',
      left: this.state.moveX || card.x,
      top: this.state.moveY || card.y,
    }

    return (
      <DraggableCore
        allowAnyClick={false}
        disabled={false}
        enableUserSelectHack={false}
        onStart={this.onStart}
        onDrag={this.onDrag}
        onStop={this.onStop}
      >
        <div
          id={`card-${card.id}`}
          className={classNames('card', card.type, this.props.selected ? 'selected' : 'unselected')}
          style={style}
        >
          {card.type === 'text' ? this.renderTextInner(card) : this.renderImageInner(this.state)}
          <span className="cardResizeHandle" />
        </div>
      </DraggableCore>
    )
  }

  renderTextInner() {
    return (
      <InlineEditor
        cardId={this.props.card.id}
        text={this.props.card.text}
        selected={this.props.selected}
        onLocalHeight={this.onLocalHeight}
        cardHeight={this.props.card.height}
      />
    )
  }

  renderImageInner(state) {
    if (state.loading) {
      return <h3>Loading</h3>
    }
    return <img className="image" alt="" src={state.imagePath} />
  }
}

Card.propTypes = {
  selected: PropTypes.bool.isRequired,
  card: PropTypes.shape({
    type: PropTypes.string,
    id: PropTypes.string,
    text: PropTypes.string,
    hyperfile: PropTypes.object,
    x: PropTypes.number,
    y: PropTypes.number,
    height: PropTypes.number,
    width: PropTypes.number,
  }).isRequired
}

export default Card
